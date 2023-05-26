/// <reference types="webxr" />
import { Component, Emitter, Material, NumberArray, Object3D } from '@wonderlandengine/api';
/**
 * Check whether given point on plane's bounding box is inside plane's polygon
 *
 * @param p 3D point in plane's local space, Y value is ignored, since it is assumed
 *     that the point was checked against the plane's bounding box.
 * @param plane XRPlane that has `XRPlane.polygon`
 * @returns `true` if the point lies on the plane
 */
export declare function isPointLocalOnXRPlanePolygon(p: NumberArray, plane: XRPlane): boolean;
/**
 * Check whether given point on plane's bounding box is inside plane's polygon
 *
 * @param p 3D point to test. It is assumed that the point was checked against
 *     the plane's bounding box beforehand.
 * @param plane XRPlane that has `XRPlane.polygon`
 * @returns `true` if the point lies on the plane
 */
export declare function isPointWorldOnXRPlanePolygon(object: Object3D, p: NumberArray, plane: XRPlane): false | undefined;
/**
 * Generate meshes and collisions for XRPlanes using [WebXR Device API - Plane Detection](https://immersive-web.github.io/real-world-geometry/plane-detection.html).
 */
export declare class PlaneDetection extends Component {
    #private;
    static TypeName: string;
    /**
     * Material to assign to created plane meshes or `null` if meshes should not be created.
     */
    planeMaterial: Material | null;
    /**
     * Collision mask to assign to newly created collision components or a negative value if
     * collision components should not be created.
     */
    collisionMask: number;
    /** Map of all planes and their last updated timestamps */
    planes: Map<XRPlane, DOMHighResTimeStamp>;
    /** Objects generated for each XRPlane */
    planeObjects: Map<XRPlane, Object3D>;
    /** Called when a plane starts tracking */
    onPlaneFound: Emitter<[XRPlane, Object3D]>;
    /** Called when a plane stops tracking */
    onPlaneLost: Emitter<[XRPlane, Object3D]>;
    update(): void;
}
