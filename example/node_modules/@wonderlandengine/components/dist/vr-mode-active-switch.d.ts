/**
 * Allows switching all other components on an object to active/inactive
 * depending on whether a VR/AR session is active.
 *
 * Useful for hiding controllers until the user enters VR for example.
 */
export class VrModeActiveSwitch extends Component {
    static Properties: {
        /** When components should be active: In VR or when not in VR */
        activateComponents: {
            type: Type;
            values: string[];
            default: string;
        };
        /** Whether child object's components should be affected */
        affectChildren: {
            type: Type;
            default: boolean;
        };
    };
    start(): void;
    components: any;
    onSessionStartCallback: (() => void) | undefined;
    onSessionEndCallback: (() => void) | undefined;
    onActivate(): void;
    onDeactivate(): void;
    getComponents(obj: any): void;
    setComponentsActive(active: any): void;
    onXRSessionStart(): void;
    onXRSessionEnd(): void;
}
import { Component } from '@wonderlandengine/api';
import { Type } from '@wonderlandengine/api';
