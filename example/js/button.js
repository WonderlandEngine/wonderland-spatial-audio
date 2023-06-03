import {
  Component,
  MeshComponent,
  Property,
  Emitter,
} from "@wonderlandengine/api";
import { CursorTarget } from "@wonderlandengine/components";
import { AudioSource } from "wonderland-spatial-audio";
import { getAudioMixer } from "wonderland-spatial-audio";

/**
 * Helper function to trigger haptic feedback pulse.
 *
 * @param {Object} object An object with 'input' component attached
 * @param {number} strength Strength from 0.0 - 1.0
 * @param {number} duration Duration in milliseconds
 */
export function hapticFeedback(object, strength, duration) {
  const input = object.getComponent("input");
  if (input && input.xrInputSource) {
    const gamepad = input.xrInputSource.gamepad;
    if (gamepad && gamepad.hapticActuators)
      gamepad.hapticActuators[0].pulse(strength, duration);
  }
}

/**
 * Button component.
 *
 * Shows a 'hoverMaterial' on cursor hover, moves backward on cursor down,
 * returns to its position on cursor up, plays click/unclick sounds and haptic
 * feedback on hover.
 *
 * Use `addClickFunction(() => {})` on the `cursor-target` component used
 * with the button to define the button's action.
 *
 * Supports interaction with `finger-cursor` component for hand tracking.
 */
export class ButtonComponent extends Component {
  static TypeName = "button";
  static Properties = {
    buttonLight: Property.object(),
    audioObject: Property.object(),
    hoverMaterial: Property.material(),
  };
  static Dependencies = [CursorTarget];

  /* Position to return to when "unpressing" the button */
  returnPos = new Float32Array(3);
  Direction = {
    UP: "up",
    DOWN: "down",
    STILL: "still",
  };

  start() {
    const target =
      this.object.getComponent(CursorTarget) ||
      this.object.addComponent(CursorTarget);

    this.audioEffect = this.audioObject.getComponent(AudioSource);
    //this.audioEffect.onEnded.add(() => (this.audioObject.active = false));

    target.onHover.add(this.onHover.bind(this));
    target.onUnhover.add(this.onUnHover.bind(this));
    target.onDown.add(this.onDown.bind(this));
    target.onUp.add(this.onUp.bind(this));
    this.returnPos = this.object.getPositionLocal();

    this.targetPos = this.returnPos[1];
    this.currentPos = 0;
    this.direction = this.Direction.STILL;
    this.time = 0;
    this.playFirst = -1;
    this.playSecond = -1;
    this.playThird = -1;
  }

  /* Called by 'cursor-target' */
  onHover(_, cursor) {
    this.targetPos = this.returnPos[1] - 0.02;
    this.direction = this.Direction.DOWN;
    if (cursor.type === "finger-cursor") {
      this.onDown(_, cursor);
    }

    hapticFeedback(cursor.object, 0.5, 50);
  }

  /* Called by 'cursor-target' */
  async onDown(_, cursor) {
    const am = getAudioMixer();
    this.playFirst = Math.floor(Math.random() * am.getNumOfSources());
    this.targetPos = this.returnPos[1] - 0.1;
    this.direction = this.Direction.DOWN;
    hapticFeedback(cursor.object, 1.0, 20);
  }

  /* Called by 'cursor-target' */
  onUp(_, cursor) {
    this.targetPos = this.returnPos[1];
    this.direction = this.Direction.UP;
    hapticFeedback(cursor.object, 0.7, 20);
  }

  /* Called by 'cursor-target' */
  onUnHover(_, cursor) {
    this.targetPos = this.returnPos[1];
    this.direction = this.Direction.UP;
    if (cursor.type === "finger-cursor") {
      this.onUp(_, cursor);
    }

    hapticFeedback(cursor.object, 0.3, 50);
  }

  update(dt) {
    this.time += dt;
    if (this.direction === this.Direction.STILL) {
    } else if (this.direction == this.Direction.DOWN) {
      this.currentPos = this.object.getPositionLocal()[1];
      this.object.translateLocal([0, -0.01, 0]);
      if (this.currentPos < this.targetPos)
        this.direction = this.Direction.STILL;
    } else if (this.direction == this.Direction.UP) {
      this.currentPos = this.object.getPositionLocal()[1];
      this.object.translateLocal([0, 0.005, 0]);
      if (this.currentPos > this.targetPos)
        this.direction = this.Direction.STILL;
    }

    if(this.playFirst !== -1) {
      this.time = 0;
      const am = getAudioMixer();
      am.playAudio(this.playFirst);
      this.playSecond = Math.floor(Math.random() * am.getNumOfSources());
      this.playFirst = -1;
    }
    if (this.time > 1 && this.playSecond !== -1) {
      const am = getAudioMixer();
      am.playAudio(this.playSecond);
      this.playThird = Math.floor(Math.random() * am.getNumOfSources());
      this.playSecond = -1;
    }
    if (this.time > 2 && this.playThird !== -1) {
      const am = getAudioMixer();
      am.playAudio(this.playThird);
      this.playThird = -1;
    }
  }
}
