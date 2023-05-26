import { Component, Object3D } from '@wonderlandengine/api';
/**
 * Prints some limited debug information about the object.
 *
 * Information consists of: This object's name, an object parameter's name,
 * the object's world translation, world transform and local transform.
 *
 * Mainly used by engine developers for debug purposes or as example code.
 */
export declare class DebugObject extends Component {
    static TypeName: string;
    /** A second object to print the name of */
    obj: Object3D | null;
    start(): void;
}
