import {Component, Property} from '@wonderlandengine/api';
import {CursorTarget} from '@wonderlandengine/components';
import {globalAudioManager, AudioSource} from '@wonderlandengine/spatial-audio';

enum Sounds {
    Click,
    Unclick,
    Welcome,
}

/**
 * Helper function to trigger haptic feedback pulse.
 *
 * @param {Object} object An object with 'input' component attached
 * @param {number} strength Strength from 0.0 - 1.0
 * @param {number} duration Duration in milliseconds
 */
export function hapticFeedback(object, strength, duration) {
    const input = object.getComponent('input');
    if (input && input.xrInputSource) {
        const gamepad = input.xrInputSource.gamepad;
        if (gamepad && gamepad.hapticActuators)
            gamepad.hapticActuators[0].pulse(strength, duration);
    }
}

/**
 * Button component.
 *
 * Supports interaction with `finger-cursor` component for hand tracking.
 */
export class ButtonComponent extends Component {
    static TypeName = 'button';
    static Properties = {
        buttonLight: Property.object(),
        hoverMaterial: Property.material(),
    };

    static onRegister(engine) {
        /* Triggered when this component class is registered.
         * You can for instance register extra component types here
         * that your component may create. */
        engine.registerComponent(CursorTarget);
    }
    /* Position to return to when "unpressing" the button */
    returnPos = new Float32Array(3);
    async start() {
        const target =
            this.object.getComponent(CursorTarget) ||
            this.object.addComponent(CursorTarget);

        this.audio = this.object.getComponent('ball-spawner');

        target.onHover.add(this.onHover.bind(this));
        target.onUnhover.add(this.onUnHover.bind(this));
        target.onDown.add(this.onDown.bind(this));
        target.onUp.add(this.onUp.bind(this));
        this.returnPos = this.object.getPositionLocal();

        await globalAudioManager.loadBatch(
            ['sfx/click.wav', Sounds.Click],
            ['sfx/unclick.wav', Sounds.Unclick],
            ['sfx/welcome.wav', Sounds.Welcome],
        )

        globalAudioManager.autoplay(Sounds.Welcome, {
            position: [-5, 1, 2],
            volume: 0.5,
        });

    }

    /* Called by 'cursor-target' */
    onHover(_, cursor) {
        if (cursor.type === 'finger-cursor') {
            this.onDown(_, cursor);
        }

        hapticFeedback(cursor.object, 0.5, 50);
    }

    /* Called by 'cursor-target' */
    async onDown(_, cursor) {
        globalAudioManager.play(Sounds.Click, {
            position: this.returnPos,
            volume: 0.3
        });
        this.audio.startPlaying();
        this.object.setPositionLocal([
            this.returnPos[0],
            this.returnPos[1] - 0.08,
            this.returnPos[2],
        ]);
        hapticFeedback(cursor.object, 1.0, 20);
    }

    /* Called by 'cursor-target' */
    onUp(_, cursor) {
        this.object.setPositionLocal(this.returnPos);
        globalAudioManager.play(Sounds.Unclick, {
            position: this.returnPos,
            volume: 0.3
        });
        hapticFeedback(cursor.object, 0.7, 20);
    }

    /* Called by 'cursor-target' */
    onUnHover(_, cursor) {
        if (cursor.type === 'finger-cursor') {
            this.onUp(_, cursor);
        }

        hapticFeedback(cursor.object, 0.3, 50);
    }
}
