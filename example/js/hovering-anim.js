import {Component, Property} from '@wonderlandengine/api';

/**
 * hovering_anim
 */
export class HoveringAnim extends Component {
    static TypeName = 'hovering-anim';
    /* Properties that are configurable in the editor */
    static Properties = {
        speed: Property.float(1.0),
        height: Property.float(1.0),
        fixedZ: Property.bool(true),
    };

    start() {
        this.posLocal = this.object.getPositionWorld();
        this.time = 0;
        this.positionZ = this.posLocal[1];
    }

    update(dt) {
        this.time += dt;
        this.posLocal = this.object.getPositionWorld();
        if (this.fixedZ) {
            this.object.setPositionWorld([
                this.posLocal[0],
                Math.sin(this.time * this.speed) * this.height * Math.sin(this.time) +
                    this.positionZ,
                this.posLocal[2],
            ]);
        } else {
            this.object.setPositionWorld([
                Math.sin(this.time) + this.posLocal[0],
                Math.sin(this.time * this.speed) * this.height * Math.sin(this.time) +
                    this.positionZ,
                Math.cos(this.time) + this.posLocal[2],
            ]);
        }
    }
}
