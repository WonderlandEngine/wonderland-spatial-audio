import { Component, Property, Emitter } from "@wonderlandengine/api";
import { getAudioMixer } from "./audio-mixer";

const tempVec = new Float32Array(3);

/**
 * Adds a audio source to the AudioMixer and saves its audioID.
 */
export class AudioSource extends Component {
  static TypeName = "audio-source";
  static Properties = {
    /** Path to the audio file */
    audioFile: Property.string(null),
    /** Max allowed volume (1.0 is 100%) */
    volume: Property.float(1.0)
  }

  onEnded = new Emitter();

  async start() {
    this.volume = Math.min(this.volume, 1.0);
    this.audioID = await getAudioMixer().addSource(
        this.audioFile,
      this.object.getPositionWorld(tempVec),
        this.volume
    );
    this.update = this._update.bind(this);
  }

  async play() {
    const prom = await getAudioMixer()
        .playAudio(this.audioID);
    prom.addEventListener("ended", this.onEnded.notify.bind(this.onEnded));
  }

  stop() {
    getAudioMixer().stopAudio(this.audioID);
  }

  isPlaying() {
    return getAudioMixer().isPlaying(this.audioID);
  }

  _update(dt) {
    getAudioMixer().updatePosition(this.audioID, this.object.getPositionWorld(tempVec));
  }
}
