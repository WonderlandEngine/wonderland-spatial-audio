import {Component, Property} from '@wonderlandengine/api';

/**
 * light-hover
 */
export class LightHover extends Component {
    static TypeName = 'light-hover';
    /* Properties that are configurable in the editor */
    static Properties = {
        param: Property.float(1.0)
    };

    static onRegister(engine) {
        /* Triggered when this component class is registered.
         * You can for instance register extra component types here
         * that your component may create. */
    }

    start() {
        this.posLocal = this.object.getPositionLocal();
        this.time = Math.random();
        this.positionZ = 0.5;
    }

    update(dt) {
        this.time += dt;
        this.positionZ;
        this.object.setPositionLocal([
            this.posLocal[0],
            (Math.pow(Math.sin(this.time), 2) / 10) * this.speed + this.positionZ,
            this.posLocal[2],
        ]);
    }
}
