import { Container } from '@pixi/display';
import { Sprite } from '@pixi/sprite';
import { Texture } from '@pixi/core';
import { Polygon } from '@pixi/math';
import '@pixi/mixin-get-child-by-name';
import { SmoothGraphics as Graphics } from '@pixi/graphics-smooth';
import { IPointData } from '@pixi/math';
import { GRAPHICS_CURVES } from '@pixi/graphics';

import { colorToPixi } from '../utils/color';
import { EdgeStyle, NodeStyle } from '../utils/style';
import {
  getCubicBezierAngle,
  getCubicBezierXY,
  getQuadraticAngle,
  getQuadraticBezierXY,
  getQuadraticStartEndPoint,
  getLoopEdgeBezierPoint,
  getPolygonPoints,
} from '../utils/bezier';
import { TextureCache } from '../texture-cache';

GRAPHICS_CURVES.minSegments = 8 * 8;
const DELIMETER = '::';
const WHITE = 0xffffff;

const EDGE_LINE = 'EDGE_LINE';
const EDGE_ARROW = 'EDGE_ARROW';

const EDGE_CURVE = 'EDGE_CURVE';
const EDGE_CURVE_ARROW = 'EDGE_CURVE_ARROW';

const ARROW_SIZE = 5;

export function createEdge(edgeGfx: Container) {
  // edgeGfx -> edgeLine
  const edgeLine = new Sprite(Texture.WHITE);
  edgeLine.name = EDGE_LINE;
  edgeLine.anchor.set(0.5);
  edgeGfx.addChild(edgeLine);

  // edgeGfx -> edgeArrow
  const edgeArrow = new Sprite();
  edgeArrow.name = EDGE_ARROW;
  edgeArrow.anchor.set(0, 0.5);
  edgeGfx.addChild(edgeArrow);

  // edgeGfx -> edgeCurve
  const edgeCurve = new Graphics();
  edgeCurve.name = EDGE_CURVE;
  edgeGfx.addChild(edgeCurve);

  // edgeGfx -> edgeArrow
  const edgeCurveArrow = new Graphics();
  edgeCurveArrow.name = EDGE_CURVE_ARROW;
  edgeGfx.addChild(edgeCurveArrow);
}

export function updateEdgePosition(
  edgeGfx: Container,
  sourceNodePosition: IPointData,
  targetNodePosition: IPointData,
  nodeStyle: NodeStyle,
  edgeStyle: EdgeStyle,
  textureCache: TextureCache,
  isDirected: boolean,
  isSelfLoop: boolean,
  parallelEdgeCount: number,
  parallelSeq: number
) {
  const nodeSize = nodeStyle.size;
  const [color, alpha] = colorToPixi(edgeStyle.color);
  const length = Math.hypot(targetNodePosition.x - sourceNodePosition.x, targetNodePosition.y - sourceNodePosition.y);

  const edgeLine = edgeGfx.getChildByName!(EDGE_LINE) as Sprite;
  const edgeArrow = edgeGfx.getChildByName!(EDGE_ARROW) as Sprite;
  const edgeCurve = edgeGfx.getChildByName!(EDGE_CURVE) as Graphics;
  const edgeCurveArrow = edgeGfx.getChildByName!(EDGE_CURVE_ARROW) as Graphics;

  edgeLine.visible = false;
  edgeArrow.visible = false;
  edgeCurve.visible = false;
  edgeCurveArrow.visible = false;

  if (isSelfLoop) {
    edgeCurve.visible = true;
    edgeCurveArrow.visible = true;

    const { sx, sy, cp1x, cp1y, cp2x, cp2y, ex, ey } = getLoopEdgeBezierPoint(nodeSize, parallelSeq, 0, 0);

    // only do clear when node position changed
    edgeCurve.clear();
    edgeCurve.lineStyle({ width: edgeStyle.width, color, alpha });
    edgeCurve.moveTo(sx, sy);
    edgeCurve.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, ex, ey);

    // set hit area
    changeHitArea(edgeCurve, edgeStyle.width);

    // edgeGfx -> edgeCurveArrow
    // only do clear when node position changed
    edgeCurveArrow.clear();
    const coord = getCubicBezierXY(1, sx, sy, cp1x, cp1y, cp2x, cp2y, ex, ey);
    const angle = getCubicBezierAngle(1, sx, sy, cp1x, cp1y, cp2x, cp2y, ex, ey);

    edgeCurveArrow.x = coord.x;
    edgeCurveArrow.y = coord.y;
    edgeCurveArrow.rotation = angle;

    edgeCurveArrow.beginFill(color, alpha, true);
    edgeCurveArrow.moveTo(-ARROW_SIZE * 2, -ARROW_SIZE);
    edgeCurveArrow.lineTo(0, 0);
    edgeCurveArrow.lineTo(-ARROW_SIZE * 2, ARROW_SIZE);
    edgeCurveArrow.lineTo(-ARROW_SIZE * 2, -ARROW_SIZE);
    edgeCurveArrow.closePath();
    edgeCurveArrow.endFill();

    return;
  }

  // edgeGfx -> edgeArrow
  if (isStraightLine(isSelfLoop, parallelEdgeCount, parallelSeq)) {
    edgeLine.visible = true;
    edgeArrow.visible = true;

    // edgeGfx -> edgeLine
    edgeLine.width = length;

    if (isDirected) {
      // edgeGfx -> edgeArrow
      const edgeArrowTextureKey = [EDGE_ARROW].join(DELIMETER);
      const edgeArrowTexture = textureCache.get(edgeArrowTextureKey, () => {
        const graphics = new Graphics();
        graphics.beginFill(WHITE, 1.0, true);
        graphics.moveTo(-ARROW_SIZE * 2, -ARROW_SIZE);
        graphics.lineTo(0, 0);
        graphics.lineTo(-ARROW_SIZE * 2, ARROW_SIZE);
        graphics.lineTo(-ARROW_SIZE * 2, -ARROW_SIZE);
        graphics.closePath();
        graphics.endFill();

        return graphics;
      });

      // todo(lin): seems add 0.5 will make the arrow better fit with node circle
      //    may need change to this.renderer.resolution / 0.2
      edgeArrow.x = length / 2 - nodeSize - ARROW_SIZE * 2 + 0.5;
      edgeArrow.texture = edgeArrowTexture;
      [edgeArrow.tint, edgeArrow.alpha] = colorToPixi(edgeStyle.color);
    }
  } else {
    edgeCurve.visible = true;
    edgeCurveArrow.visible = true;

    // edgeGfx -> edgeCurve
    const dir = parallelSeq % 2 === 0 ? 1 : -1;
    const seqInDir = Math.ceil(parallelSeq / 2);

    const { sx, sy, ex, ey } = getQuadraticStartEndPoint(nodeSize, 5 * seqInDir * dir, -length / 2, 0, length / 2, 0);
    const curveHeight = length * 0.25 * seqInDir * dir;

    // only do clear when node position changed
    edgeCurve.clear();
    edgeCurve.lineStyle({ width: 1, color, alpha });
    edgeCurve.moveTo(sx, sy);
    edgeCurve.quadraticCurveTo(0, curveHeight, ex, ey);

    // set hit area
    changeHitArea(edgeCurve, edgeStyle.width);

    // edgeGfx -> edgeCurveArrow
    // only do clear when node position changed
    edgeCurveArrow.clear();
    const coord = getQuadraticBezierXY(1, sx, sy, 0, curveHeight, ex, ey);
    const angle = getQuadraticAngle(1, sx, sy, 0, curveHeight, ex, ey);

    edgeCurveArrow.x = coord.x;
    edgeCurveArrow.y = coord.y;
    edgeCurveArrow.rotation = angle;

    edgeCurveArrow.beginFill(color, alpha, true);
    edgeCurveArrow.moveTo(-ARROW_SIZE * 2, -ARROW_SIZE);
    edgeCurveArrow.lineTo(0, 0);
    edgeCurveArrow.lineTo(-ARROW_SIZE * 2, ARROW_SIZE);
    edgeCurveArrow.lineTo(-ARROW_SIZE * 2, -ARROW_SIZE);
    edgeCurveArrow.closePath();
    edgeCurveArrow.endFill();
  }
}

export function updateEdgeStyle(
  edgeGfx: Container,
  edgeStyle: EdgeStyle,
  _textureCache: TextureCache,
  _isDirected: boolean,
  isSelfLoop: boolean,
  parallelEdgeCount: number,
  parallelSeq: number
) {
  if (isStraightLine(isSelfLoop, parallelEdgeCount, parallelSeq)) {
    // edgeGfx -> edgeLine
    const edgeLine = edgeGfx.getChildByName!(EDGE_LINE) as Sprite;
    edgeLine.height = edgeStyle.width;
    [edgeLine.tint, edgeLine.alpha] = colorToPixi(edgeStyle.color);
  } else {
    const [color, alpha] = colorToPixi(edgeStyle.color);
    const edgeCurve = edgeGfx.getChildByName!(EDGE_CURVE) as Graphics;
    edgeCurve.lineStyle({ width: edgeStyle.width, color, alpha });
  }
}

export function updateEdgeVisibility(
  edgeGfx: Container,
  zoomStep: number,
  isSelfLoop: boolean,
  parallelEdgeCount: number,
  parallelSeq: number,
  alwaysShowEdge?: boolean
) {
  const edgeLine = edgeGfx.getChildByName!(EDGE_LINE) as Sprite;
  const edgeArrow = edgeGfx.getChildByName!(EDGE_ARROW) as Sprite;
  const edgeCurve = edgeGfx.getChildByName!(EDGE_CURVE) as Graphics;
  const edgeCurveArrow = edgeGfx.getChildByName!(EDGE_CURVE_ARROW) as Graphics;

  if (isStraightLine(isSelfLoop, parallelEdgeCount, parallelSeq)) {
    // edgeGfx -> edgeLine
    edgeLine.visible = zoomStep >= 2 || !!alwaysShowEdge;
    // edgeGFX -> edgeArrow
    edgeArrow.visible = zoomStep >= 3 || !!alwaysShowEdge;

    // hide curve
    edgeCurve.visible = false;
    edgeCurveArrow.visible = false;
  } else {
    // edgeGfx -> edgeCurve
    edgeCurve.visible = zoomStep >= 2;
    // edgeGfx -> edgeCurveArrow
    edgeCurveArrow.visible = zoomStep >= 3;

    // hide line
    edgeLine.visible = false;
    edgeArrow.visible = false;
  }
}

function isStraightLine(isSelfLoop: boolean, parallelEdgeCount: number, parallelSeq: number) {
  if (isSelfLoop) {
    return false;
  }
  return parallelEdgeCount <= 1 || (parallelEdgeCount % 2 === 1 && parallelSeq === parallelEdgeCount);
}

function changeHitArea(edgeCurve: Graphics, width: number) {
  const edgePoints = edgeCurve.currentPath.points;
  const ploygonPoints = getPolygonPoints(width, edgePoints);
  const shape = new Polygon(ploygonPoints);
  edgeCurve.hitArea = shape;
}
