// public/audio-processor.js
// Mova este arquivo para /public/audio-processor.js no seu projeto

class AudioProcessor extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input.length > 0) {
      const channelData = input[0];
      const int16Data = new Int16Array(channelData.length);
      for (let i = 0; i < channelData.length; i++) {
        int16Data[i] = Math.max(-1, Math.min(1, channelData[i])) * 0x7FFF;
      }
      this.port.postMessage(int16Data);
    }
    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
