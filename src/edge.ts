import { Container } from '@pixi/display';
import { InteractionEvent } from '@pixi/interaction';
import { IPointData } from '@pixi/math';
import { TypedEmitter } from 'tiny-typed-emitter';
import { createEdge, updateEdgeStyle, updateEdgeVisibility, updateEdgePosition } from './renderers/edge';
import { EdgeStyle, NodeStyle } from './utils/style';
import { TextureCache } from './texture-cache';
import { createEdgeLabel, updateEdgeLabelVisibility, updateLabelPosition } from './renderers/edge-label';
import { getCubicBezierXY, getLoopEdgeBezierPoint } from './utils/bezier';

interface PixiEdgeEvents {
  mousemove: (event: MouseEvent) => void;
  mouseover: (event: MouseEvent) => void;
  mouseout: (event: MouseEvent) => void;
  mousedown: (event: MouseEvent) => void;
  mouseup: (event: MouseEvent) => void;
}

export class PixiEdge extends TypedEmitter<PixiEdgeEvents> {
  edgeGfx: Container;
  edgePlaceholderGfx: Container;

  edgeLabelGfx: Container;
  edgeLabelPlaceholderGfx: Container;

  hovered: boolean = false;
  // todo(lin)
  //  later we need to support select state for edge
  selected: boolean = false;

  constructor() {
    super();

    this.edgeGfx = this.createEdge();
    this.edgePlaceholderGfx = new Container();

    this.edgeLabelGfx = this.createEdgeLabel();
    this.edgeLabelPlaceholderGfx = new Container();
  }

  createEdge() {
    const edgeGfx = new Container();
    edgeGfx.interactive = true;
    edgeGfx.buttonMode = true;
    edgeGfx.on('mousemove', (event: InteractionEvent) =>
      this.emit('mousemove', event.data.originalEvent as MouseEvent)
    );
    edgeGfx.on('mouseover', (event: InteractionEvent) =>
      this.emit('mouseover', event.data.originalEvent as MouseEvent)
    );
    edgeGfx.on('mouseout', (event: InteractionEvent) => this.emit('mouseout', event.data.originalEvent as MouseEvent));
    edgeGfx.on('mousedown', (event: InteractionEvent) =>
      this.emit('mousedown', event.data.originalEvent as MouseEvent)
    );
    edgeGfx.on('mouseup', (event: InteractionEvent) => this.emit('mouseup', event.data.originalEvent as MouseEvent));
    createEdge(edgeGfx);
    return edgeGfx;
  }

  createEdgeLabel() {
    const edgeLabelGfx = new Container();
    createEdgeLabel(edgeLabelGfx);
    return edgeLabelGfx;
  }

  updatePosition(
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
    const position = {
      x: (sourceNodePosition.x + targetNodePosition.x) / 2,
      y: (sourceNodePosition.y + targetNodePosition.y) / 2,
    };
    const rotation = Math.atan2(
      targetNodePosition.y - sourceNodePosition.y,
      targetNodePosition.x - sourceNodePosition.x
    );
    this.edgeGfx.position.copyFrom(position);
    this.edgeGfx.rotation = rotation;

    let selfLoopHeight: number | undefined = undefined;

    if (isSelfLoop) {
      // we need to do calculate here to setup correct coordinates
      const nodeSize = nodeStyle.size;
      let { sx, sy, cp1x, cp1y, cp2x, cp2y, ex, ey } = getLoopEdgeBezierPoint(
        nodeSize,
        parallelSeq,
        sourceNodePosition.x,
        sourceNodePosition.y
      );
      // const length = Math.hypot(sx - ex, sy - ey);

      const position = {
        x: (sx + ex) / 2,
        y: (sy + ey) / 2,
      };
      const rotation = Math.atan2(ey - sy, ex - sx);
      this.edgeLabelGfx.position.copyFrom(position);
      this.edgeLabelGfx.rotation = rotation;

      sourceNodePosition = {
        x: -length / 2,
        y: 0,
      };
      targetNodePosition = {
        x: length / 2,
        y: 0,
      };

      const center = getCubicBezierXY(0.5, sx, sy, cp1x, cp1y, cp2x, cp2y, ex, ey);

      // we calculate self loop height here and pass to edge label
      // note, we use position to calculate height
      selfLoopHeight = Math.hypot(center.x - position.x, center.y - position.y);
    } else {
      this.edgeLabelGfx.position.copyFrom(position);
      this.edgeLabelGfx.rotation = rotation;
    }

    updateEdgePosition(
      this.edgeGfx,
      sourceNodePosition,
      targetNodePosition,
      nodeStyle,
      edgeStyle,
      textureCache,
      isDirected,
      isSelfLoop,
      parallelEdgeCount,
      parallelSeq
    );

    updateLabelPosition(
      this.edgeLabelGfx,
      sourceNodePosition,
      targetNodePosition,
      nodeStyle,
      edgeStyle,
      textureCache,
      isDirected,
      isSelfLoop,
      parallelEdgeCount,
      parallelSeq,
      selfLoopHeight
    );
  }

  updateStyle(
    edgeStyle: EdgeStyle,
    textureCache: TextureCache,
    isDirected: boolean,
    isSelfLoop: boolean,
    parallelEdgeCount: number,
    parallelSeq: number
  ) {
    updateEdgeStyle(this.edgeGfx, edgeStyle, textureCache, isDirected, isSelfLoop, parallelEdgeCount, parallelSeq);
  }

  updateVisibility(
    zoomStep: number,
    isSelfLoop: boolean,
    parallelEdgeCount: number,
    parallelSeq: number,
    alwaysShowEdge?: boolean
  ) {
    updateEdgeVisibility(this.edgeGfx, zoomStep, isSelfLoop, parallelEdgeCount, parallelSeq, alwaysShowEdge);
    updateEdgeLabelVisibility(this.edgeLabelGfx, zoomStep);
  }
}
