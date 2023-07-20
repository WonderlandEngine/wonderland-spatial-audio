import {Component, Property} from '@wonderlandengine/api';
import { AudioSource } from "../../src/audio-source";

const tempVec = new Float32Array(3);
/**
 * ball-spawner
 */
export class BallSpawner extends Component {
    static TypeName = 'ball-spawner';
    /* Properties that are configurable in the editor */
    static Properties = {
        ballCount: Property.int(2),
        mesh: Property.mesh(),
        mat: Property.material(),
        textComp: Property.object()
    };

    static onRegister(engine) {
        /* Triggered when this component class is registered.
         * You can for instance register extra component types here
         * that your component may create. */
        engine.registerComponent(AudioSource);
    }

    start() {
        /* Spawn 10 new objects with this.object as parent and
            * let Wonderland Engine know, we will need 10 components (one per object) */
        this.balls = WL.scene.addObjects(this.ballCount, this.object, this.ballCount * 2);
        this.text = this.textComp.getComponent('text');
        this.text.text = this.ballCount;

        /* Attach meshes */
        for(let o of this.balls) {
            let mesh = o.addComponent('mesh');
            mesh.mesh = this.mesh;
            mesh.material = this.mat;
            o.setScalingWorld([0.5, 0.5, 0.5]);
            const rand = Math.floor(Math.random() * 4) + 1;
            o.addComponent(AudioSource, {
                audioFile: "sfx/" + rand + ".wav"
            });
            /* Currently this disables all lights for some reason
            o.addComponent('light', {
                lightType: WL.LightType.Point,
                shadows: true
            });
            */
            o.active = false;
        }
    }

    update(dt) {
        /* Called every frame. */
    }

    startPlaying() {
        for(let o of this.balls) {
            /*
            tempVec[0] = Math.random() * 40 - 20;
            tempVec[1] = Math.random() * 6 + 1;
            tempVec[2] = Math.random() * 40 - 20;
             */
            tempVec[0] = Math.random() * 80 - 40;
            tempVec[1] = Math.random() * 6 + 1;
            tempVec[2] = Math.random() * 80 - 40;
            const audio = o.getComponent(AudioSource);
            if(audio.isPlaying()) {
               audio.stop();
                o.active = false;
            } else {
                o.setPositionWorld(tempVec);
                audio.play();
                o.active = true;
            }

        }
    }
}
