/**
 * This is a modified version of twoz [hrtf-panner-js](https://github.com/twoz/hrtf-panner-js)
 *
 * Translated to TypeScript and using [MIT HRTF measurements](https://sound.media.mit.edu/resources/KEMAR.html)
 */
import { Point, Triangle, Delaunay } from './delaunay.ts';

export class HRTFContainer {
    /* 64 samples should be enough quality for most applications.
    * Note that increasing the sample size reduces performance. */
    private readonly HRIR_PATH: string = './hrtf_64.bin';
    public hrirLoaded: Promise<unknown>;
    private hrirData: Float32Array;
    private triangles: Triangle[];

    public readonly sampleSize: number;

    constructor() {
        this.sampleSize = this.getSampleSizeFromPathName();
        this.hrirLoaded = this.loadHrir();
        this.hrirData = new Float32Array(0);
        this.triangles = [];
    }

    /**
     * Loads the HRIR data from a binary.
     *
     * The Binary structure is as follows:
     *
     *         Elevation | Azimuth | Data <-- Left ear
     *         Elevation | Azimuth | Data <-- Right ear
     *         Elevation | Azimuth | Data <-- Left ear
     *         ...
     */
    private async loadHrir(): Promise<any> {
        const response = await fetch(this.HRIR_PATH);
        const buffer = await response.arrayBuffer();

        let count: number = 0;
        let points: Point[] = [];
        if (buffer) {
            let offset = 0;
            this.hrirData = new Float32Array(buffer);
            while (offset < this.hrirData.length) {
                const elevation = this.hrirData[offset];
                offset++;

                const azimuth = this.hrirData[offset];
                offset++;

                const point = new Point(azimuth, elevation);

                /* The Point object has a storage to conveniently keep track
                 * of the data location in 'this.hrirData' */
                point.setBufferIndex(count);

                offset += this.sampleSize * 2 + 2;

                points.push(point);
                count += 2;
            }
            this.triangles = new Delaunay(points).getTriangles();
        }
    }

    public interpolateHRIR(
        azm: number,
        elv: number
    ): [Float32Array, Float32Array] | undefined {
        let C: Point;
        let X: number[];
        let g1, g2, g3: number;

        for (const tri of this.triangles) {
            C = tri.p3;
            X = [azm - C.x, elv - C.y];
            g1 = tri.invT[0] * X[0] + tri.invT[2] * X[1];
            g2 = tri.invT[1] * X[0] + tri.invT[3] * X[1];
            g3 = 1 - g1 - g2;
            if (g1 >= 0 && g2 >= 0 && g3 >= 0) {
                const A = tri.p1;
                const B = tri.p2;
                const blockSize = this.sampleSize + 2;
                const hrirL = new Float32Array(this.sampleSize);
                const hrirR = new Float32Array(this.sampleSize);
                const iAL: number = A.bufferIndex * blockSize + 2;
                const iAR: number = (A.bufferIndex + 1) * blockSize + 2;
                const iBL: number = B.bufferIndex * blockSize + 2;
                const iBR: number = (B.bufferIndex + 1) * blockSize + 2;
                const iCL: number = C.bufferIndex * blockSize + 2;
                const iCR: number = (C.bufferIndex + 1) * blockSize + 2;
                for (let i = 0; i < this.sampleSize; ++i) {
                    hrirL[i] =
                        g1 * this.hrirData[iAL + i] +
                        g2 * this.hrirData[iBL + i] +
                        g3 * this.hrirData[iCL + i];
                    hrirR[i] =
                        g1 * this.hrirData[iAR + i] +
                        g2 * this.hrirData[iBR + i] +
                        g3 * this.hrirData[iCR + i];
                }
                return [hrirL, hrirR];
            }
        }
        return undefined;
    }

    private getSampleSizeFromPathName(): number {
        const match = this.HRIR_PATH.match(/\d+/);
        if (match) {
            return parseInt(match[0], 10);
        }
        throw new Error('Sample size could not be identified!');
    }
}

export class HRTFPanner {
    private readonly crossfadeDuration: number = 25 / 1000;
    private readonly source: GainNode;
    private readonly hiPass: BiquadFilterNode;
    private readonly loPass: BiquadFilterNode;
    private readonly hrtfContainer: HRTFContainer;
    private readonly audioContext: AudioContext;
    private targetConvolver: HRTFConvolver;
    private currentConvolver: HRTFConvolver;
    private gain: GainNode;
    private currentPos: number[];
    private transisitonTime: number;

    constructor(
        audioContext: AudioContext,
        sourceNode: GainNode,
        hrtfContainer: HRTFContainer
    ) {
        this.audioContext = audioContext;
        this.hrtfContainer = hrtfContainer;
        this.loPass = this.audioContext.createBiquadFilter();
        this.hiPass = this.audioContext.createBiquadFilter();
        this.loPass.type = 'lowpass';
        this.loPass.frequency.value = 150;
        this.hiPass.type = 'highpass';
        this.hiPass.frequency.value = 150;

        this.targetConvolver = new HRTFConvolver(
            this.audioContext,
            hrtfContainer.sampleSize
        );

        this.currentConvolver = new HRTFConvolver(
            this.audioContext,
            hrtfContainer.sampleSize
        );

        this.gain = audioContext.createGain();
        this.source = sourceNode;
        this.source.channelCount = 1;
        this.source.connect(this.loPass);
        this.source.connect(this.hiPass);
        this.hiPass.connect(this.currentConvolver.convolver);
        this.hiPass.connect(this.targetConvolver.convolver);
        this.loPass.connect(this.audioContext.destination);
        this.currentConvolver.gainNode.connect(this.gain);
        this.targetConvolver.gainNode.connect(this.gain);
        this.gain.connect(this.audioContext.destination);

        this.currentPos = [];
        this.transisitonTime = this.audioContext.currentTime;
    }

    /**
     * Update the position of the panner.
     *
     * @param azimuth Position of the new location.
     * @param elevation Position of the new location.
     */
    public update(azimuth: number, elevation: number): void {
        /* Skip if the position didn't change or there is still a crossfade going on */
        if (
            (Math.abs(this.currentPos[0] - azimuth) < 0.1 &&
                Math.abs(this.currentPos[1] - elevation) < 0.1) ||
            this.transisitonTime > this.audioContext.currentTime
        )
            return;

        this.targetConvolver.fillBuffer(
            this.hrtfContainer.interpolateHRIR(azimuth, elevation)
        );

        /* Adding 1ms ensures both fades start at the same time */
        this.transisitonTime =
            this.audioContext.currentTime + (1 / 1000);
        this.targetConvolver.gainNode.gain.setValueAtTime(
            0,
            this.transisitonTime
        );
        this.targetConvolver.gainNode.gain.linearRampToValueAtTime(
            1,
            this.transisitonTime + this.crossfadeDuration
        );
        this.currentConvolver.gainNode.gain.setValueAtTime(
            1,
            this.transisitonTime
        );
        this.currentConvolver.gainNode.gain.linearRampToValueAtTime(
            0,
            this.transisitonTime + this.crossfadeDuration
        );
        this.transisitonTime += this.crossfadeDuration;

        /* Swap convolvers */
        let t = this.targetConvolver;
        this.targetConvolver = this.currentConvolver;
        this.currentConvolver = t;

        /* Save the current position */
        this.currentPos[0] = azimuth;
        this.currentPos[1] = elevation;
    }
}

class HRTFConvolver {
    public convolver: ConvolverNode;
    public buffer: AudioBuffer;
    public gainNode: GainNode;

    constructor(audioContext: AudioContext, bufferSize: number) {
        this.buffer = audioContext.createBuffer(
            2,
            bufferSize,
            audioContext.sampleRate
        );
        this.convolver = audioContext.createConvolver();
        this.convolver.normalize = false;
        this.convolver.buffer = this.buffer;
        this.gainNode = audioContext.createGain();

        this.convolver.connect(this.gainNode);
    }

    public fillBuffer(iR: [Float32Array, Float32Array] | undefined) {
        if (iR === undefined) return;
        let bufferL = this.buffer.getChannelData(0);
        let bufferR = this.buffer.getChannelData(1);
        for (let i = 0; i < this.buffer.length; ++i) {
            bufferL[i] = iR[0][i];
            bufferR[i] = iR[1][i];
        }
        this.convolver.buffer = this.buffer;
    }
}

/**
 * Converts cartesion to interaural coordinates.
 *
 * @note This is NOT a standard conversion! It is modified,
 *  to respect the hrtf measurements, used in this project.
 *
 * @param x1 - axis that passes through the ears from left to right
 * @param x2 - axis that passes "between the eyes" and points ahead
 * @param x3 - axis that points "up"
 *
 * @returns azimuth and elevation in degrees.
 */
export function cartesianToInteraural(
    x: number,
    y: number,
    z: number
): { azimuth: number; elevation: number } {
    let azimuth = Math.atan2(y, x);
    const horizontalDistance = Math.sqrt(x ** 2 + y ** 2);
    const elevation = Math.atan2(z, horizontalDistance);

    /* Convert to degrees and modify to fit HRIR */
    let azimuthDegrees = azimuth * (180 / Math.PI) + 90;
    if (azimuthDegrees < 0) {
        azimuthDegrees = 360 + azimuthDegrees;
    }
    // @todo: Check if elevation needs modification.
    let elevationDegrees = elevation * (180 / Math.PI);
    if (elevationDegrees < -40) elevationDegrees = -40;
    return { azimuth: azimuthDegrees, elevation: elevationDegrees };
}

function interauralToCartesian(r: number, azm: number, elv: number) {
    azm = deg2rad(azm);
    elv = deg2rad(elv);
    let x1 = r * Math.sin(azm);
    let x2 = r * Math.cos(azm) * Math.cos(elv);
    let x3 = r * Math.cos(azm) * Math.sin(elv);
    return { x1: x1, x2: x2, x3: x3 };
}

function deg2rad(deg: number) {
    return (deg * Math.PI) / 180;
}

function rad2deg(rad: number) {
    return (rad * 180) / Math.PI;
}
