import { DisplayObjectWithCulling, Simple } from 'pixi-cull';
// import { Point } from '@pixi/math';
// import { Bounds } from '@pixi/display';

// refer: https://github.com/davidfig/pixi-cull/issues/2#issuecomment-570087695
export default class Cull extends Simple {
  updateObject(object: DisplayObjectWithCulling) {
    // original code
    // const box = object.getLocalBounds();
    // object.AABB = object.AABB || { x: 0, y: 0, width: 0, height: 0 };
    // object.AABB.x = object.x + (box.x - object.pivot.x) * Math.abs(object.scale.x);
    // object.AABB.y = object.y + (box.y - object.pivot.y) * Math.abs(object.scale.y);
    // object.AABB.width = box.width * Math.abs(object.scale.x);
    // object.AABB.height = box.height * Math.abs(object.scale.y);

    const box = object.getBounds();
    object.AABB = box;

    // const rotPivot = new Point(object.x + object.pivot.x, object.y + object.pivot.y);
    // const rotSin = Math.sin(object.rotation);
    // const rotCos = Math.cos(object.rotation);

    // const points = [
    //   new Point(object.x, object.y),
    //   new Point(object.x + box.width, object.y),
    //   new Point(object.x, object.y + box.height),
    //   new Point(object.x + box.width, object.y + box.height),
    // ];
    // const pointsTransformed = points.map((point) => {
    //   return new Point(
    //     (point.x - rotPivot.x) * rotCos - (point.y - rotPivot.y) * rotSin + rotPivot.x,
    //     (point.x - rotPivot.x) * rotSin + (point.y - rotPivot.y) * rotCos + rotPivot.y
    //   );
    // });

    // const bounds = new Bounds();
    // pointsTransformed.map((point) => bounds.addPoint(point));
    // const aabb = bounds.getRectangle();

    // object.AABB = aabb;
  }
}
