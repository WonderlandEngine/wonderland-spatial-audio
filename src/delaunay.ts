const EPSILON: number = 1.0 / 1048576.0;

export class Delaunay {
    private vertices: Point[];
    private triangles: Triangle[];
    private supertri: Triangle;

    constructor(points: Point[]) {
        this.vertices = points;
        this.supertri = Triangle.createZeroTriangle();
        this.triangles = this.triangulate();
    }

    private setSupertriangle(): void {
        let xmin = Number.POSITIVE_INFINITY;
        let ymin = Number.POSITIVE_INFINITY;
        let xmax = Number.NEGATIVE_INFINITY;
        let ymax = Number.NEGATIVE_INFINITY;

        for (let i = 0; i < this.vertices.length; ++i) {
            if (this.vertices[i].x < xmin) xmin = this.vertices[i].x;
            if (this.vertices[i].x > xmax) xmax = this.vertices[i].x;
            if (this.vertices[i].y < ymin) ymin = this.vertices[i].y;
            if (this.vertices[i].y > ymax) ymax = this.vertices[i].y;
        }

        const dx: number = xmax - xmin;
        const dy: number = ymax - ymin;
        const dmax: number = Math.max(dx, dy);
        const xmid: number = xmin + dx * 0.5;
        const ymid: number = ymin + dy * 0.5;

        this.supertri = new Triangle(
            new Point(xmid - 20 * dmax, ymid - dmax),
            new Point(xmid, ymid + 20 * dmax),
            new Point(xmid + 20 * dmax, ymid - dmax)
        );
    }

    private triangulate(): Triangle[] {
        if (this.vertices.length < 3)
            throw new Error('No Points to triangulate!');

        /* Create array with indices sorted by vertices' x-position */
        let indices: number[] = Array.from(
            Array(this.vertices.length - 1).keys()
        );

        indices.sort((i, j) => {
            return this.vertices[j].x - this.vertices[i].x;
        });

        this.setSupertriangle();
        this.supertri.calculateCircumcircle();
        let open: Triangle[] = [this.supertri];
        let closed: Triangle[] = [];

        /* Incrementally add each vertex to the mesh */
        for (let i = 0; i < indices.length; ++i) {
            let edges: Edge[] = [];
            /* For each open triangle, check to see if the current point is
             * inside it's circumcircle. If it is, remove the triangle and add
             * it's edges to an edge list. */
            for (let j = 0; j < open.length; ++j) {
                /* If this point is to the right of this triangle's circumcircle,
                 * then this triangle should never get checked again. Remove it
                 * from the open list, add it to the closed list, and skip. */
                const dx: number =
                    this.vertices[indices[i]].x - open[j].ccMiddle.x;
                if (dx > 0.0 && dx * dx > open[j].ccRadius) {
                    closed.push(open[j]);
                    open.splice(j, 1);
                    continue;
                }

                /* If we're outside the circumcircle, skip this triangle. */
                const dy: number =
                    this.vertices[indices[i]].y - open[j].ccMiddle.y;
                if (dx * dx + dy * dy - open[j].ccRadius > EPSILON) continue;

                /* Remove the triangle and add it's edges to the edge list. */
                edges.push(
                    new Edge(open[j].p1, open[j].p2),
                    new Edge(open[j].p2, open[j].p3),
                    new Edge(open[j].p3, open[j].p1)
                );

                open.splice(j, 1);
            }

            for (let x = 0; x < edges.length; ++x) {
                const b = edges[x].p1;
                const a = edges[x].p2;

                for (let z = 0; z < edges.length; ++z) {
                    if (z === x) continue;
                    const n = edges[z].p1;
                    const m = edges[z].p2;

                    if (
                        (a.equals(m) && b.equals(n)) ||
                        (a.equals(n) && b.equals(m))
                    ) {
                        edges.splice(x, 1);
                        edges.splice(z, 1);
                        break;
                    }
                }
            }
            /* Add a new triangle for each edge. */
            for (let j: number = 0; j < edges.length; ++j) {
                const b = edges[j].p2;
                const a = edges[j].p1;
                const triangle: Triangle = new Triangle(
                    a,
                    b,
                    this.vertices[indices[i]]
                );
                triangle.calculateCircumcircle();
                open.push(triangle);
            }
        }
        /* Copy any remaining open triangles to the closed list, and then
         * remove any triangles that share a vertex with the supertriangle,
         * building a list of triplets that represent triangles. */
        for (let i: number = open.length; i--; ) closed.push(open[i]);
        open.length = 0;

        const n = this.vertices.length;
        for (let i: number = closed.length; i--; ) {
            if (
                closed[i].p1.x < n &&
                closed[i].p1.y < n &&
                closed[i].p2.x < n &&
                closed[i].p2.y < n &&
                closed[i].p3.x < n &&
                closed[i].p3.y < n
            ) {
                open.push(closed[i]);
            }
        }
        /* Yay, we're done! */
        return open;
    }

    public getTriangles(): Triangle[] {
        return this.triangles;
    }
}

export class Point {
    public bufferIndex: number = 0;

    constructor(public x: number, public y: number) {}

    public isZero() {
        return this.x == 0 && this.y == 0;
    }

    public equals(point: Point): boolean {
        return this.x === point.x && this.y === point.y;
    }

    public setBufferIndex(i: number): void {
        this.bufferIndex = i;
    }
}

class Edge {
    constructor(public p1: Point, public p2: Point) {}

    public equals(edge: Edge): boolean {
        return (
            this.p1.x === edge.p1.x &&
            this.p2.x === edge.p2.x &&
            this.p1.y === edge.p1.y &&
            this.p2.y === edge.p2.y
        );
    }
}

export class Triangle {
    public readonly p1: Point;
    public readonly p2: Point;
    public readonly p3: Point;
    public ccMiddle: Point;
    public ccRadius: number;
    public invT: number[];

    constructor(p1: Point, p2: Point, p3: Point) {
        this.p1 = p1;
        this.p2 = p2;
        this.p3 = p3;
        this.ccRadius = 0.0;
        this.ccMiddle = new Point(0, 0);

        /* Cache some calculations for the interpolation inside the Triangle */
        const T = [p1.x - p3.x, p1.y - p1.y, p2.x - p3.x, p2.y - p3.y];
        this.invT = [T[3], -T[1], -T[2], T[0]];
        const det = 1 / (T[0] * T[3] - T[1] * T[2]);
        for (let j = 0; j < this.invT.length; ++j) this.invT[j] *= det;
    }

    static createZeroTriangle(): Triangle {
        return new Triangle(new Point(0, 0), new Point(0, 0), new Point(0, 0));
    }

    public calculateCircumcircle(): void {
        const fabsy1y2: number = Math.abs(this.p1.y - this.p2.y);
        const fabsy2y3: number = Math.abs(this.p2.y - this.p3.y);

        /* Check for coincident points */
        if (fabsy1y2 < EPSILON && fabsy2y3 < EPSILON) {
            console.log('hello');
            throw new Error('Eek! Coincident points!');
        }

        if (fabsy1y2 < EPSILON) {
            const m2 = -((this.p3.x - this.p2.x) / (this.p3.y - this.p2.y));
            const mx2 = (this.p2.x + this.p3.x) / 2.0;
            const my2 = (this.p2.y + this.p3.y) / 2.0;
            this.ccMiddle.x = (this.p2.x + this.p1.x) / 2.0;
            this.ccMiddle.y = m2 * (this.ccMiddle.x - mx2) + my2;
        } else if (fabsy2y3 < EPSILON) {
            const m1 = -((this.p2.x - this.p1.x) / (this.p2.y - this.p1.y));
            const mx1 = (this.p1.x + this.p2.x) / 2.0;
            const my1 = (this.p1.y + this.p2.y) / 2.0;
            this.ccMiddle.x = (this.p3.x + this.p2.x) / 2.0;
            this.ccMiddle.y = m1 * (this.ccMiddle.x - mx1) + my1;
        } else {
            const m1 = -((this.p2.x - this.p1.x) / (this.p2.y - this.p1.y));
            const m2 = -((this.p3.x - this.p2.x) / (this.p3.y - this.p2.y));
            const mx1 = (this.p1.x + this.p2.x) / 2.0;
            const my1 = (this.p1.y + this.p2.y) / 2.0;
            const mx2 = (this.p2.x + this.p3.x) / 2.0;
            const my2 = (this.p2.y + this.p3.y) / 2.0;
            this.ccMiddle.x = (m1 * mx1 - m2 * mx2 + my2 - my1) / (m1 - m2);
            this.ccMiddle.y =
                fabsy1y2 > fabsy2y3
                    ? m1 * (this.ccMiddle.x - mx1) + my1
                    : m2 * (this.ccMiddle.x - mx2) + my2;
        }

        const dx: number = this.p2.x - this.ccMiddle.x;
        const dy: number = this.p2.y - this.ccMiddle.y;
        this.ccRadius = dx * dx + dy * dy;
    }

    public isSharingVertexWith(triangle: Triangle): boolean {
        return (
            this.p1.equals(triangle.p1) ||
            this.p1.equals(triangle.p2) ||
            this.p1.equals(triangle.p3) ||
            this.p2.equals(triangle.p1) ||
            this.p2.equals(triangle.p2) ||
            this.p2.equals(triangle.p3) ||
            this.p3.equals(triangle.p1) ||
            this.p2.equals(triangle.p2) ||
            this.p3.equals(triangle.p3)
        );
    }
}
