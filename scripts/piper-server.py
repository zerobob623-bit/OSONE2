#!/usr/bin/env python3
"""
Piper TTS — servidor HTTP local
Uso: python scripts/piper-server.py
Porta: 5000

Requisitos:
    pip install piper-tts flask flask-cors

Modelos de voz (baixe em huggingface.co/rhasspy/piper-voices):
    - pt_BR/faber/medium  → coloque em piper-models/pt_BR-faber-medium.onnx
    - pt_BR/edresson/low  → coloque em piper-models/pt_BR-edresson-low.onnx
"""

import io
import os
import wave
from flask import Flask, request, send_file, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

MODELS_DIR = os.path.join(os.path.dirname(__file__), '..', 'piper-models')
_voice_cache: dict = {}


def get_voice(voice_id: str):
    """Carrega (e faz cache) de uma instância PiperVoice."""
    if voice_id not in _voice_cache:
        try:
            from piper.voice import PiperVoice
        except ImportError:
            raise RuntimeError("piper-tts não instalado. Execute: pip install piper-tts")

        model_path = os.path.join(MODELS_DIR, f"{voice_id}.onnx")
        if not os.path.exists(model_path):
            raise FileNotFoundError(
                f"Modelo '{voice_id}' não encontrado em {MODELS_DIR}/\n"
                f"Baixe em: https://huggingface.co/rhasspy/piper-voices"
            )
        _voice_cache[voice_id] = PiperVoice.load(model_path)
    return _voice_cache[voice_id]


@app.route('/tts', methods=['POST'])
def synthesize():
    data = request.get_json(force=True)
    text  = (data.get('text') or '').strip()
    voice = (data.get('voice') or 'pt_BR-faber-medium').strip()

    if not text:
        return jsonify({'error': 'Campo "text" vazio'}), 400

    try:
        piper_voice = get_voice(voice)
    except (FileNotFoundError, RuntimeError) as e:
        return jsonify({'error': str(e)}), 404

    buf = io.BytesIO()
    with wave.open(buf, 'wb') as wav_file:
        piper_voice.synthesize(text, wav_file)

    buf.seek(0)
    return send_file(buf, mimetype='audio/wav', as_attachment=False)


@app.route('/voices', methods=['GET'])
def list_voices():
    """Lista modelos .onnx disponíveis na pasta piper-models/."""
    os.makedirs(MODELS_DIR, exist_ok=True)
    voices = [
        f.replace('.onnx', '')
        for f in os.listdir(MODELS_DIR)
        if f.endswith('.onnx')
    ]
    return jsonify({'voices': voices})


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})


if __name__ == '__main__':
    os.makedirs(MODELS_DIR, exist_ok=True)
    print("=" * 60)
    print("  Piper TTS — servidor local")
    print(f"  Modelos esperados em: {os.path.abspath(MODELS_DIR)}/")
    print("  Endpoint: POST http://localhost:5000/tts")
    print("  Body:     {{ \"text\": \"...\", \"voice\": \"pt_BR-faber-medium\" }}")
    print("=" * 60)
    app.run(host='0.0.0.0', port=5000, debug=False)
