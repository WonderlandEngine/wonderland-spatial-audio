import { Component, Property, Emitter } from "@wonderlandengine/api";
import { getAudioMixer } from "./audio-mixer";

const tempVec = new Float32Array(3);

/**
 * Adds a audio source to the AudioMixer and saves its audioID.
 */
export class AudioSource extends Component {
  static TypeName = "audio-source";
  static Properties = {
    file: Property.string(),
  };

  onEnded = new Emitter();

  async start() {
    const rand = Math.floor(Math.random() * 4) + 1;
    this.audioID = await getAudioMixer().addSource(
      "sfx/" + rand + ".wav",
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
