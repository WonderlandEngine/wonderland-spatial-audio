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
  /* Properties that are configurable in the editor */
  static Properties = {
    param: Property.float(1.0),
  };

  static onRegister(engine) {
    /* Triggered when this component class is registered.
     * You can for instance register extra component types here
     * that your component may create. */
  }

  start() {
    this.lum = 0.0;
    this.audiosrc = this.object.getComponent(AudioSource);
    this.light = this.object.getComponent(LightComponent);
    this.light.intensity = this.lum;
    this.meshComp = this.object.getComponent(MeshComponent);
    this.meshComp.material.color = [this.lum, this.lum, this.lum, this.lum];
    this.mixer = getAudioMixer();
  }

  update(dt) {
    const mixer = getAudioMixer();
    if (mixer.isPlaying(this.audiosrc.audioID)) {
        this.lum = this.lum < 1.0 ? (this.lum + 0.05) : 1.0;
    } else {
        this.lum = this.lum > 0.0 ? (this.lum - 0.005) : 0.0;
    }
    this.light.intensity = this.lum;
    this.meshComp.material.color = [this.lum, this.lum, this.lum, this.lum];
  }
}
