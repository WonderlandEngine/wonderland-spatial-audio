import {
  Component,
  LightComponent,
  Material,
  Mesh,
  MeshComponent,
  Property,
} from "@wonderlandengine/api";
import { AudioSource } from "../../src/audio-source";
import { getAudioMixer } from "../../src/audio-mixer";

/**
 * light-anim
 */
export class LightAnim extends Component {
  static TypeName = "light-anim";

  start() {
    this.lum = 0.0;
    this.audiosrc = this.object.getComponent(AudioSource);
    console.log(this.audiosrc.audioID);
    this.light = this.object.getComponent(LightComponent);
    this.light.intensity = this.lum;
    this.meshComp = this.object.getComponent(MeshComponent);
    this.mat = this.meshComp.material.clone();
    this.meshComp.material = this.mat;
    this.mat.color = [1.0, 1.0, 1.0, this.lum];
  }

  update(dt) {
    const mixer = getAudioMixer();
    if (mixer.isPlaying(this.audiosrc.audioID)) {
      this.lum = Math.min(this.lum + 0.05, 1.0);
    } else {
      this.lum = Math.max(this.lum - 0.005, 0.0);
    }
    this.light.intensity = this.lum;
    this.mat.color = [1.0, 1.0, 1.0, this.lum];
  }
}
