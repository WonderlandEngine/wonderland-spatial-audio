import { HRTFContainer, HRTFPanner, cartesianToInteraural } from './hrtf';
import { vec3 } from 'gl-matrix';

const tempVec = new Float32Array(3);

export class AudioMixer {
    constructor() {
        this.audioContext = new AudioContext();
        this.hrtfContainer = new HRTFContainer();
        this.loaded = this.hrtfContainer.loadHrir("kemar_L.bin");
        this.maxAudibleDist = 10;
        this.listener = null;
        this.sources = [];
        this.audioNodes = [];
    }

    setListener(object) {
        this.listener = object;
    }

    async addSource(audioFile, pos) {
        const audioData = await this.getAudioData(audioFile);
        var gain = this.audioContext.createGain();
        gain.gain.value = 0.3;
        const panner = new HRTFPanner(
            this.audioContext,
            gain,
            this.hrtfContainer
        );
        panner.connect(this.audioContext.destination);

        const id = this.sources.length;
        this.sources.push({ audioData, panner, gain });

        await this.loaded;
        // set initial panning
        this.updatePos(id, pos);
        return id;
    }

    updatePos(source, pos) {
        if (source > this.sources.length) {
            console.log('no id');
            return false;
        }
        var relativePosition = new Float32Array(3);
        this.listener.transformPointInverseWorld(
            relativePosition,
            pos
        );
        var cords = cartesianToInteraural(
            relativePosition[0],
            relativePosition[2],
            relativePosition[1]
        );
        this.sources[source].panner.update(cords.azm, cords.elv);

        // adjust volume for distance
        this.listener.getPositionWorld(tempVec);
        const distance = Math.abs(vec3.distance(tempVec, pos));
        const rolloffFactor = 0.5;
        const refDistance = 1.0;
        const vol = refDistance / (refDistance + rolloffFactor * (Math.max(distance, refDistance) - refDistance));
        this.sources[source].gain.gain.value = vol;
        return true;
    }

    playAudio(source) {
        const audioNode = this.audioContext.createBufferSource();
        this.audioNodes[source] = audioNode;
        audioNode.connect(this.sources[source].gain);
        audioNode.buffer = this.sources[source].audioData;
        audioNode.addEventListener('ended', () => this.audioNodes[source] = null);
        audioNode.start();

        return audioNode;
    }

    stopAudio(source) {
        if (this.isPlaying(source))
            this.audioNodes[source].stop();
    }

    isPlaying(source) {
        return this.audioNodes[source] != null;
    }

    playAllAudio() {
        this.sources.forEach(element => {
            const audioNode = this.audioContext.createBufferSource();
            audioNode.connect(element.gain);
            audioNode.buffer = element.audioData;
            audioNode.start();
        });
    }

    async getAudioData(file) {
        const response = await fetch(file);
        const buffer = await response.arrayBuffer();
        return this.audioContext.decodeAudioData(buffer);
    }
}
let audioMixer = null;

export function getAudioMixer() {
    if (audioMixer == null) {
        audioMixer = new AudioMixer();
    }
    return audioMixer;
}
