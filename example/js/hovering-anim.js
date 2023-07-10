import { Component, Property } from "@wonderlandengine/api";

/**
 * hovering_anim
 */
export class HoveringAnim extends Component {
  static TypeName = "hovering-anim";
  /* Properties that are configurable in the editor */
  static Properties = {
    speed: Property.float(1.0),
  };

  static onRegister(engine) {
    /* Triggered when this component class is registered.
     * You can for instance register extra component types here
     * that your component may create. */
  }

  start() {
    this.posLocal = this.object.getPositionLocal();
    this.time = 0;
    this.positionZ = 0.5;
  }

  update(dt) {
    this.time += dt;
    this.positionZ;
    this.object.setPositionLocal([
      this.posLocal[0],
      (Math.pow(Math.sin(this.time), 2) / 100) * this.speed + this.positionZ,
      this.posLocal[2],
    ]);
  }
}
