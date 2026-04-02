#!/usr/bin/env python3
"""
Servidor Piper TTS local para OSONE2
=====================================

INSTALAÇÃO (uma vez só):
  pip install piper-tts flask flask-cors

BAIXAR VOZ PT-BR (uma vez só):
  mkdir -p piper-models
  cd piper-models

  # Voz masculina pt-BR (recomendada):
  curl -L -o pt_BR-faber-medium.onnx \
    https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/faber/medium/pt_BR-faber-medium.onnx
  curl -L -o pt_BR-faber-medium.onnx.json \
    https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/faber/medium/pt_BR-faber-medium.onnx.json

  # Voz masculina compacta pt-BR (mais rápida):
  curl -L -o pt_BR-edresson-low.onnx \
    https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/edresson/low/pt_BR-edresson-low.onnx
  curl -L -o pt_BR-edresson-low.onnx.json \
    https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/edresson/low/pt_BR-edresson-low.onnx.json

EXECUTAR:
  python piper-server.py

  # Ou com porta/voz personalizadas:
  python piper-server.py --port 5000 --voice pt_BR-faber-medium --models-dir ./piper-models

TESTAR:
  curl -X POST http://localhost:5000/tts \
    -H "Content-Type: application/json" \
    -d '{"text":"Olá, tudo bem?"}' \
    --output teste.wav
"""

import sys
import io
import wave
import argparse
import os
from pathlib import Path

try:
    from flask import Flask, request, Response, jsonify
    from flask_cors import CORS
except ImportError:
    print("❌ Instale as dependências: pip install flask flask-cors piper-tts")
    sys.exit(1)

try:
    from piper.voice import PiperVoice
except ImportError:
    print("❌ Instale o piper: pip install piper-tts")
    sys.exit(1)

# ─── Argumentos ──────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser(description='Piper TTS HTTP Server')
parser.add_argument('--port',       type=int,   default=5000,                  help='Porta do servidor (padrão: 5000)')
parser.add_argument('--host',       type=str,   default='0.0.0.0',             help='Host (padrão: 0.0.0.0)')
parser.add_argument('--voice',      type=str,   default='pt_BR-faber-medium',  help='Voz padrão')
parser.add_argument('--models-dir', type=str,   default='./piper-models',      help='Pasta com os modelos .onnx')
args = parser.parse_args()

MODELS_DIR  = Path(args.models_dir)
DEFAULT_VOICE = args.voice

# ─── App Flask ────────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)  # Permite chamadas do browser (localhost:5173, etc.)

# Cache de vozes carregadas (evita recarregar a cada requisição)
voice_cache: dict = {}

def load_voice(voice_name: str) -> PiperVoice:
    if voice_name in voice_cache:
        return voice_cache[voice_name]

    model_path = MODELS_DIR / f"{voice_name}.onnx"
    if not model_path.exists():
        raise FileNotFoundError(
            f"Modelo '{voice_name}.onnx' não encontrado em '{MODELS_DIR}'.\n"
            f"Baixe em: https://huggingface.co/rhasspy/piper-voices"
        )

    print(f"📦 Carregando voz: {voice_name}...")
    voice = PiperVoice.load(str(model_path))
    voice_cache[voice_name] = voice
    print(f"✅ Voz '{voice_name}' carregada.")
    return voice


# ─── Rota principal: POST /tts ────────────────────────────────────────────────
@app.route('/tts', methods=['POST', 'GET'])
def tts():
    # Aceita JSON (POST) ou query string (GET)
    if request.method == 'POST':
        data = request.get_json(silent=True) or {}
        text       = data.get('text', '').strip()
        voice_name = data.get('voice', DEFAULT_VOICE)
    else:
        text       = request.args.get('text', '').strip()
        voice_name = request.args.get('voice', DEFAULT_VOICE)

    if not text:
        return jsonify({'error': 'Campo "text" é obrigatório'}), 400

    try:
        voice = load_voice(voice_name)

        # Sintetiza para buffer WAV em memória
        buf = io.BytesIO()
        with wave.open(buf, 'wb') as wav_out:
            voice.synthesize(text, wav_out)

        buf.seek(0)
        return Response(buf.read(), mimetype='audio/wav')

    except FileNotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ─── Rota de saúde: GET /health ───────────────────────────────────────────────
@app.route('/health', methods=['GET'])
def health():
    available = [f.stem for f in MODELS_DIR.glob('*.onnx')] if MODELS_DIR.exists() else []
    return jsonify({
        'status': 'ok',
        'default_voice': DEFAULT_VOICE,
        'loaded_voices': list(voice_cache.keys()),
        'available_models': available,
    })


# ─── Rota de listagem: GET /voices ────────────────────────────────────────────
@app.route('/voices', methods=['GET'])
def voices():
    available = [f.stem for f in MODELS_DIR.glob('*.onnx')] if MODELS_DIR.exists() else []
    return jsonify({'voices': available})


# ─── Início ───────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    print(f"""
╔══════════════════════════════════════════════╗
║         🎙️  Piper TTS Server — OSONE2        ║
╚══════════════════════════════════════════════╝
  URL:        http://localhost:{args.port}
  Voz padrão: {DEFAULT_VOICE}
  Modelos em: {MODELS_DIR.resolve()}

  Endpoints:
    POST /tts     {{ "text": "...", "voice": "..." }}
    GET  /health
    GET  /voices
""")

    # Pré-carrega a voz padrão para a primeira requisição ser instantânea
    try:
        load_voice(DEFAULT_VOICE)
    except FileNotFoundError:
        print(f"⚠️  Voz padrão '{DEFAULT_VOICE}' não encontrada.")
        print(f"   Baixe em: https://huggingface.co/rhasspy/piper-voices/tree/main/pt/pt_BR")
        print()

    app.run(host=args.host, port=args.port, debug=False)
