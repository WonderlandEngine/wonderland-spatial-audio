import { Component, Property, Emitter } from "@wonderlandengine/api";
import { getAudioMixer } from "./audio-mixer";

const tempVec = new Float32Array(3);

/**
 * Adds a audio source to the AudioMixer and saves its audioID.
 */
export class AudioSource extends Component {
  static TypeName = "audio-source";
  static Properties = {
    audioFile: Property.string(null)
  }

  onEnded = new Emitter();

  async start() {
    this.audioID = await getAudioMixer().addSource(
        this.audioFile,
      this.object.getPositionWorld(tempVec)
    );
    this.update = this._update.bind(this);

  }

  play() {
    getAudioMixer()
      .playAudio(this.audioID)
      .addEventListener("ended", this.onEnded.notify.bind(this.onEnded));
  }

  _update(dt) {
    getAudioMixer().updatePosition(
      this.audioID,
      this.object.getPositionWorld(tempVec)
    );
  }
}
