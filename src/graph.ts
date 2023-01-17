import { Application } from '@pixi/app';
import { TickerPlugin } from '@pixi/ticker';
import { AppLoaderPlugin, Loader } from '@pixi/loaders';
import { BitmapFontLoader } from '@pixi/text-bitmap';
import { Renderer, BatchRenderer } from '@pixi/core';
import { InteractionEvent, InteractionManager } from '@pixi/interaction';
import { Container } from '@pixi/display';
import { Point, IPointData, Rectangle } from '@pixi/math';
import { IAddOptions } from '@pixi/loaders';
import { Viewport } from 'pixi-viewport';
import { Cull } from '@pixi-essentials/cull';
// import { Simple } from 'pixi-cull';
import { AbstractGraph } from 'graphology-types';
import { TypedEmitter } from 'tiny-typed-emitter';
import { LINE_SCALE_MODE, settings } from '@pixi/graphics-smooth';

import { Base } from '@antv/layout/lib/layout/base';
import { GridLayout, CircularLayout, ConcentricLayout, DagreLayout, ILayout, OutModel, Node, Edge } from '@antv/layout';
import { ForceAtlas2Layout, ForceAtlas2LayoutOptions } from './layouts/ForceAtlas2Layout';

import { GraphStyleDefinition, NodeStyleDefinition, resolveStyleDefinitions } from './utils/style';
import { TextType } from './utils/text';
import { BaseNodeAttributes, BaseEdgeAttributes } from './attributes';
import { TextureCache } from './texture-cache';
import { PixiNode } from './node';
import { PixiEdge } from './edge';

Application.registerPlugin(TickerPlugin);
Application.registerPlugin(AppLoaderPlugin);
Loader.registerPlugin(BitmapFontLoader);
Renderer.registerPlugin('batch', BatchRenderer);
Renderer.registerPlugin('interaction', InteractionManager);

const DEFAULT_STYLE: GraphStyleDefinition = {
  node: {
    size: 15,
    color: '#000000',
    border: {
      width: 2,
      color: '#ffffff',
    },
    icon: {},
    label: {
      type: TextType.TEXT,
      fontSize: 12,
      content: '',
      color: '#333333',
      padding: 4,
    },
  },
  edge: {
    width: 1,
    color: '#cccccc',
  },
};

const WORLD_PADDING = 100;

type LayoutOptions = ILayout.LayoutOptions | ForceAtlas2LayoutOptions;

export interface GraphOptions<
  NodeAttributes extends BaseNodeAttributes = BaseNodeAttributes,
  EdgeAttributes extends BaseEdgeAttributes = BaseEdgeAttributes
> {
  container: HTMLElement;
  graph: AbstractGraph<NodeAttributes, EdgeAttributes>;
  // detailed configuration see https://g6.antv.antgroup.com/api/graphlayout/guide
  layout: LayoutOptions;
  style: GraphStyleDefinition<NodeAttributes, EdgeAttributes>;
  hoverStyle: GraphStyleDefinition<NodeAttributes, EdgeAttributes>;
  selectStyle: GraphStyleDefinition<NodeAttributes, EdgeAttributes>;
  resources?: IAddOptions[];
}

interface PixiGraphEvents {
  // background
  rightClick: (event: MouseEvent) => void;

  // node
  nodeClick: (event: MouseEvent, nodeKey: string) => void;
  nodeDoubleClick: (event: MouseEvent, nodeKey: string) => void;
  nodeRightClick: (event: MouseEvent, nodeKey: string) => void;
  nodeMousemove: (event: MouseEvent, nodeKey: string) => void;
  nodeMouseover: (event: MouseEvent, nodeKey: string, rect: Rectangle) => void;
  nodeMouseout: (event: MouseEvent, nodeKey: string) => void;
  nodeMousedown: (event: MouseEvent, nodeKey: string) => void;
  nodeMouseup: (event: MouseEvent, nodeKey: string) => void;

  // edge
  edgeClick: (event: MouseEvent, edgeKey: string) => void;
  edgeMousemove: (event: MouseEvent, edgeKey: string) => void;
  edgeMouseover: (event: MouseEvent, edgeKey: string) => void;
  edgeMouseout: (event: MouseEvent, edgeKey: string) => void;
  edgeMousedown: (event: MouseEvent, edgeKey: string) => void;
  edgeMouseup: (event: MouseEvent, edgeKey: string) => void;
}

export class PixiGraph<
  NodeAttributes extends BaseNodeAttributes = BaseNodeAttributes,
  EdgeAttributes extends BaseEdgeAttributes = BaseEdgeAttributes
> extends TypedEmitter<PixiGraphEvents> {
  container: HTMLElement;
  graph: AbstractGraph<NodeAttributes, EdgeAttributes>;
  layoutConfig: LayoutOptions;
  // @ts-ignore
  layout: Base;
  // @ts-ignore
  forceAtlas2Layout: ForceAtlas2Layout;
  iterationNum = 0;
  iterations = 0;
  style: GraphStyleDefinition<NodeAttributes, EdgeAttributes>;
  hoverStyle: GraphStyleDefinition<NodeAttributes, EdgeAttributes>;
  selectStyle: GraphStyleDefinition<NodeAttributes, EdgeAttributes>;
  resources?: IAddOptions[];

  private app: Application;
  private textureCache: TextureCache;
  private viewport: Viewport;
  // private cull: Simple;
  private resizeObserver: ResizeObserver;
  private edgeLayer: Container;
  private edgeLabelLayer: Container;
  private frontEdgeLayer: Container;
  private frontEdgeLabelLayer: Container;
  private nodeLayer: Container;
  private nodeLabelLayer: Container;
  private frontNodeLayer: Container;
  private frontNodeLabelLayer: Container;
  private nodeKeyToNodeObject = new Map<string, PixiNode>();
  private edgeKeyToEdgeObject = new Map<string, PixiEdge>();

  private selectNodeKeys = new Set<string>();

  private parallelEdgeMap = new Map<string, number>();

  private mousedownNodeKey: string | null = null;
  private mousedownEdgeKey: string | null = null;
  private mouseDownPosition: { x: number; y: number } | null = null;

  private onGraphNodeAddedBound = this.onGraphNodeAdded.bind(this);
  private onGraphEdgeAddedBound = this.onGraphEdgeAdded.bind(this);
  private onGraphNodeDroppedBound = this.onGraphNodeDropped.bind(this);
  private onGraphEdgeDroppedBound = this.onGraphEdgeDropped.bind(this);
  private onGraphClearedBound = this.onGraphCleared.bind(this);
  private onGraphEdgesClearedBound = this.onGraphEdgesCleared.bind(this);
  private onGraphNodeAttributesUpdatedBound = this.onGraphNodeAttributesUpdated.bind(this);
  private onGraphEdgeAttributesUpdatedBound = this.onGraphEdgeAttributesUpdated.bind(this);
  private onGraphEachNodeAttributesUpdatedBound = this.onGraphEachNodeAttributesUpdated.bind(this);
  private onGraphEachEdgeAttributesUpdatedBound = this.onGraphEachEdgeAttributesUpdated.bind(this);
  private onDocumentMouseMoveBound = this.onDocumentMouseMove.bind(this);
  private onDocumentMouseUpBound = this.onDocumentMouseUp.bind(this);

  constructor(options: GraphOptions<NodeAttributes, EdgeAttributes>) {
    super();

    this.container = options.container;
    this.graph = options.graph;
    this.layoutConfig = options.layout;
    this.style = options.style;
    this.hoverStyle = options.hoverStyle;
    this.selectStyle = options.selectStyle;
    this.resources = options.resources;

    // do layout
    this.createLayout();
    this.doLayout();

    if (!(this.container instanceof HTMLElement)) {
      throw new Error('container should be a HTMLElement');
    }

    settings.LINE_SCALE_MODE = LINE_SCALE_MODE.NORMAL;

    // create PIXI application
    this.app = new Application({
      resizeTo: this.container,
      resolution: window.devicePixelRatio,
      transparent: true,
      antialias: true,
      autoDensity: true,
    });
    this.container.appendChild(this.app.view);
    // this.cull = new Simple({
    //   dirtyTest: true,
    // });

    this.app.renderer.plugins.interaction.moveWhenInside = true;
    this.app.view.addEventListener('wheel', (event) => {
      event.preventDefault();
    });

    this.textureCache = new TextureCache(this.app.renderer);

    // create PIXI viewport
    this.viewport = new Viewport({
      screenWidth: this.container.clientWidth,
      screenHeight: this.container.clientHeight,
      interaction: this.app.renderer.plugins.interaction,
    })
      .drag()
      .pinch()
      .wheel()
      .decelerate()
      .clampZoom({ maxScale: 5 });
    this.app.stage.addChild(this.viewport);
    this.viewport.on('mousedown', (event: InteractionEvent) => {
      if (event.target === this.viewport) {
        let mouseEvent = event.data.originalEvent as MouseEvent;
        this.mouseDownPosition = {
          x: mouseEvent.clientX,
          y: mouseEvent.clientY,
        };
      }
    });
    this.viewport.on('mouseup', (event: InteractionEvent) => {
      if (event.target === this.viewport && this.mouseDownPosition) {
        let mouseEvent = event.data.originalEvent as MouseEvent;

        let diff =
          Math.sqrt(Math.abs(mouseEvent.clientX - this.mouseDownPosition.x)) +
          Math.sqrt(Math.abs(mouseEvent.clientY - this.mouseDownPosition.y));

        if (diff <= 2) {
          this.selectNodeKeys.forEach((nodeKey) => {
            this.unselectNode(nodeKey);
          });
          this.selectNodeKeys.clear();
        }

        this.mouseDownPosition = null;
      }
    });

    this.viewport.on('rightup', (event: InteractionEvent) => {
      if (event.target === this.viewport) {
        let mouseEvent = event.data.originalEvent as MouseEvent;
        this.emit('rightClick', mouseEvent);
      }
    });

    // create layers
    this.edgeLayer = new Container();
    this.edgeLabelLayer = new Container();
    this.frontEdgeLayer = new Container();
    this.frontEdgeLabelLayer = new Container();
    this.nodeLayer = new Container();
    this.nodeLabelLayer = new Container();
    this.frontNodeLayer = new Container();
    this.frontNodeLabelLayer = new Container();
    this.viewport.addChild(this.edgeLayer);
    this.viewport.addChild(this.edgeLabelLayer);
    this.viewport.addChild(this.frontEdgeLayer);
    this.viewport.addChild(this.frontEdgeLabelLayer);
    this.viewport.addChild(this.nodeLayer);
    this.viewport.addChild(this.nodeLabelLayer);
    this.viewport.addChild(this.frontNodeLayer);
    this.viewport.addChild(this.frontNodeLabelLayer);

    this.resizeObserver = new ResizeObserver(() => {
      this.app.resize();
      this.viewport.resize(this.container.clientWidth, this.container.clientHeight);
      this.updateGraphVisibility();
    });

    // preload resources
    if (this.resources) {
      this.app.loader.add(this.resources);
    }
    this.app.loader.load(() => {
      this.viewport.on('frame-end', () => {
        if (this.viewport.dirty) {
          this.updateGraphVisibility();
          this.viewport.dirty = false;
        }
      });

      this.resizeObserver.observe(this.container);

      // need to calculate parallel edge before register event listener
      this.calculateParallelEdge();

      // listen to graph changes
      this.graph.on('nodeAdded', this.onGraphNodeAddedBound);
      this.graph.on('edgeAdded', this.onGraphEdgeAddedBound);
      this.graph.on('nodeDropped', this.onGraphNodeDroppedBound);
      this.graph.on('edgeDropped', this.onGraphEdgeDroppedBound);
      this.graph.on('cleared', this.onGraphClearedBound);
      this.graph.on('edgesCleared', this.onGraphEdgesClearedBound);
      this.graph.on('nodeAttributesUpdated', this.onGraphNodeAttributesUpdatedBound);
      this.graph.on('edgeAttributesUpdated', this.onGraphEdgeAttributesUpdatedBound);
      this.graph.on('eachNodeAttributesUpdated', this.onGraphEachNodeAttributesUpdatedBound);
      this.graph.on('eachEdgeAttributesUpdated', this.onGraphEachEdgeAttributesUpdatedBound);

      // init draw
      this.createGraph();

      this.resetView();
    });
  }

  destroy() {
    this.graph.off('nodeAdded', this.onGraphNodeAddedBound);
    this.graph.off('edgeAdded', this.onGraphEdgeAddedBound);
    this.graph.off('nodeDropped', this.onGraphNodeDroppedBound);
    this.graph.off('edgeDropped', this.onGraphEdgeDroppedBound);
    this.graph.off('cleared', this.onGraphClearedBound);
    this.graph.off('edgesCleared', this.onGraphEdgesClearedBound);
    this.graph.off('nodeAttributesUpdated', this.onGraphNodeAttributesUpdatedBound);
    this.graph.off('edgeAttributesUpdated', this.onGraphEdgeAttributesUpdatedBound);
    this.graph.off('eachNodeAttributesUpdated', this.onGraphEachNodeAttributesUpdatedBound);
    this.graph.off('eachEdgeAttributesUpdated', this.onGraphEachEdgeAttributesUpdatedBound);

    this.resizeObserver.disconnect();
    this.resizeObserver = undefined!;

    this.textureCache.destroy();
    this.textureCache = undefined!;

    this.app.destroy(true, { children: true, texture: true, baseTexture: true });
    this.app = undefined!;
  }

  private createLayout() {
    switch (this.layoutConfig.type) {
      case 'circular':
        this.layout = new CircularLayout(this.layoutConfig);
        break;

      case 'concentric':
        this.layout = new ConcentricLayout(this.layoutConfig);
        break;

      case 'grid':
        this.layout = new GridLayout(this.layoutConfig);
        break;

      case 'dagre':
        this.layout = new DagreLayout(this.layoutConfig);
        break;

      case 'forceatlas2':
        this.forceAtlas2Layout = new ForceAtlas2Layout(this.layoutConfig);
        break;

      default:
        throw new Error(`unsupported layout: ${this.layoutConfig.type}`);
    }
  }

  public updateLayout(layoutConfig: ILayout.LayoutOptions) {
    let originLayoutConfig = this.layoutConfig;
    this.layoutConfig = layoutConfig;

    // create layout object if needed
    if (this.layoutConfig.type !== originLayoutConfig.type) {
      this.createLayout();
    }
    // do layout based on new config
    this.doLayout();
  }

  private isForceLayout() {
    return this.layoutConfig.type === 'forceatlas2';
  }

  private doForceLayout() {
    console.time(this.layoutConfig.type);
    if (this.layoutConfig.type === 'forceatlas2') {
      // need to wait web worker layout failed
      this.iterationNum = 0;
      this.forceAtlas2Layout.runLayout(this.graph, true);
    }
  }

  public doLayout() {
    if (this.isForceLayout()) {
      this.doForceLayout();
      return;
    }

    // stop force layout first
    this.forceAtlas2Layout.stopLayout();

    console.time(this.layoutConfig.type);
    let nodes: Node[] = [];
    let edges: Edge[] = [];
    this.graph.forEachNode((nodeKey) =>
      nodes.push({
        id: nodeKey,
      })
    );
    this.graph.forEachEdge((_edgeKey, _edgeAttributes, sourceNodeKey, targetNodeKey) => {
      edges.push({
        source: sourceNodeKey,
        target: targetNodeKey,
      });
    });

    const layoutResult = this.layout.layout({
      nodes,
      edges,
    });

    let positionedNodes = (layoutResult as OutModel).nodes!;

    let i = 0;
    // assume the order is the same between layout and graph
    // batch update graph position
    this.graph.updateEachNodeAttributes(function (_node, attr) {
      attr.x = positionedNodes[i].x;
      attr.y = positionedNodes[i].y;
      i++;
      return attr;
    });
    console.timeEnd(this.layoutConfig.type);
  }

  private get zoomStep() {
    return Math.min(this.viewport.worldWidth, this.viewport.worldHeight) / 10;
  }

  zoomIn() {
    this.viewport.zoom(-this.zoomStep, true);
  }

  zoomOut() {
    this.viewport.zoom(this.zoomStep, true);
  }

  resetView() {
    const nodesX = this.graph.nodes().map((nodeKey) => this.graph.getNodeAttribute(nodeKey, 'x'));
    const nodesY = this.graph.nodes().map((nodeKey) => this.graph.getNodeAttribute(nodeKey, 'y'));
    const minX = Math.min(...nodesX);
    const maxX = Math.max(...nodesX);
    const minY = Math.min(...nodesY);
    const maxY = Math.max(...nodesY);

    const graphWidth = Math.abs(maxX - minX);
    const graphHeight = Math.abs(maxY - minY);
    const graphCenter = new Point(minX + graphWidth / 2, minY + graphHeight / 2);

    const worldWidth = graphWidth + WORLD_PADDING * 2;
    const worldHeight = graphHeight + WORLD_PADDING * 2;

    // TODO: update worldWidth/worldHeight when graph is updated?
    this.viewport.resize(this.container.clientWidth, this.container.clientHeight, worldWidth, worldHeight);

    this.viewport.setZoom(1); // otherwise scale is 0 when initialized in React useEffect
    this.viewport.center = graphCenter;
    this.viewport.fit(true);
  }

  private calculateParallelEdge() {
    let parallelEdgeMap = new Map<string, number>();
    this.graph.forEachEdge(
      (edgeKey: string, _edgeAttributes: EdgeAttributes, sourceNodeKey: string, targetNodeKey: string) => {
        const key = `${sourceNodeKey}_${targetNodeKey}`;
        const count = (parallelEdgeMap.get(key) || 0) + 1;
        parallelEdgeMap.set(key, count);
        this.graph.setEdgeAttribute(edgeKey, 'parallelSeq', count);
      }
    );
    this.parallelEdgeMap = parallelEdgeMap;
  }

  private onGraphNodeAdded(data: { key: string; attributes: NodeAttributes }) {
    this.calculateParallelEdge();
    const nodeKey = data.key;
    const nodeAttributes = data.attributes;
    this.createNode(nodeKey, nodeAttributes);
  }

  private onGraphEdgeAdded(data: { key: string; attributes: EdgeAttributes; source: string; target: string }) {
    this.calculateParallelEdge();
    const edgeKey = data.key;
    const edgeAttributes = data.attributes;
    const sourceNodeKey = data.source;
    const targetNodeKey = data.target;
    const sourceNodeAttributes = this.graph.getNodeAttributes(sourceNodeKey);
    const targetNodeAttributes = this.graph.getNodeAttributes(targetNodeKey);
    this.createEdge(edgeKey, edgeAttributes, sourceNodeKey, targetNodeKey, sourceNodeAttributes, targetNodeAttributes);
  }

  private onGraphNodeDropped(data: { key: string }) {
    this.calculateParallelEdge();
    const nodeKey = data.key;
    this.dropNode(nodeKey);
  }

  private onGraphEdgeDropped(data: { key: string }) {
    this.calculateParallelEdge();
    const edgeKey = data.key;
    this.dropEdge(edgeKey);
  }

  private onGraphCleared() {
    Array.from(this.edgeKeyToEdgeObject.keys()).forEach(this.dropEdge.bind(this));
    Array.from(this.nodeKeyToNodeObject.keys()).forEach(this.dropNode.bind(this));
  }

  private onGraphEdgesCleared() {
    Array.from(this.edgeKeyToEdgeObject.keys()).forEach(this.dropEdge.bind(this));
  }

  private onGraphNodeAttributesUpdated(data: { key: string }) {
    const nodeKey = data.key;
    this.updateNodeStyleByKey(nodeKey);
    // TODO: normalize position?
  }

  private onGraphEdgeAttributesUpdated(data: { key: string }) {
    const edgeKey = data.key;
    this.updateEdgeStyleByKey(edgeKey);
  }

  private onGraphEachNodeAttributesUpdated() {
    // todo(lin)
    // for force layout, seems the pixi-viewport and cull is not triggerd
    if (this.layoutConfig.type === 'forceatlas2') {
      this.iterationNum++;
      if (this.iterationNum === 1) {
        this.resetView();
      }
      if (this.iterationNum >= this.layoutConfig.iterations) {
        this.forceAtlas2Layout.stopLayout();
        console.timeEnd(this.layoutConfig.type);
      }
    }

    this.graph.forEachNode((nodeKey: string, nodeAttributes: NodeAttributes) => {
      // console.log(nodeKey, nodeAttributes.x, nodeAttributes.y);
      const node = this.nodeKeyToNodeObject.get(nodeKey)!;
      node.updatePosition({
        x: nodeAttributes.x,
        y: nodeAttributes.y,
      });
    });
    this.graph.forEachNode(this.updateNodeStyle.bind(this));
    this.graph.forEachEdge(this.updateEdgeStyle.bind(this));
  }

  private onGraphEachEdgeAttributesUpdated() {
    this.graph.forEachEdge(this.updateEdgeStyle.bind(this));
  }

  private setNodeStatus(nodeKey: string, status: 'hovered' | 'selected') {
    const node = this.nodeKeyToNodeObject.get(nodeKey)!;

    // selected > hovered
    if (status === 'hovered' && !node.selected) {
      if (node.hovered) {
        return;
      }

      // update style
      node.hovered = true;
    } else if (status === 'selected') {
      if (node.selected) {
        return;
      }

      node.selected = true;
    }

    this.updateNodeStyleByKey(nodeKey);

    // move to front
    const nodeIndex = this.nodeLayer.children.indexOf(node.nodeGfx);
    // hover then select, the select can not find
    if (nodeIndex >= 0) {
      this.nodeLayer.removeChildAt(nodeIndex);
      this.nodeLabelLayer.removeChildAt(nodeIndex);
      this.frontNodeLayer.removeChildAt(nodeIndex);
      this.frontNodeLabelLayer.removeChildAt(nodeIndex);
      this.nodeLayer.addChild(node.nodePlaceholderGfx);
      this.nodeLabelLayer.addChild(node.nodeLabelPlaceholderGfx);
      this.frontNodeLayer.addChild(node.nodeGfx);
      this.frontNodeLabelLayer.addChild(node.nodeLabelGfx);
    }
  }

  private unsetNodeStatus(nodeKey: string, status: 'hovered' | 'selected') {
    const node = this.nodeKeyToNodeObject.get(nodeKey)!;

    if (status === 'hovered' && !node.selected) {
      if (!node.hovered) {
        return;
      }

      // update style
      node.hovered = false;
    } else if (status === 'selected') {
      if (!node.selected) {
        return;
      }

      node.selected = false;
      // clear hovered state when unselect
      node.hovered = false;
    }
    this.updateNodeStyleByKey(nodeKey);

    // move to front
    if (!node.selected && !node.hovered) {
      const nodeIndex = this.frontNodeLayer.getChildIndex(node.nodeGfx);
      this.nodeLayer.removeChildAt(nodeIndex);
      this.nodeLabelLayer.removeChildAt(nodeIndex);
      this.frontNodeLayer.removeChildAt(nodeIndex);
      this.frontNodeLabelLayer.removeChildAt(nodeIndex);
      this.nodeLayer.addChild(node.nodeGfx);
      this.nodeLabelLayer.addChild(node.nodeLabelGfx);
      this.frontNodeLayer.addChild(node.nodePlaceholderGfx);
      this.frontNodeLabelLayer.addChild(node.nodeLabelPlaceholderGfx);
    }
  }

  private selectNode(nodeKey: string) {
    this.setNodeStatus(nodeKey, 'selected');
  }

  private unselectNode(nodeKey: string) {
    this.unsetNodeStatus(nodeKey, 'selected');
  }

  private hoverNode(nodeKey: string) {
    this.setNodeStatus(nodeKey, 'hovered');
  }

  private unhoverNode(nodeKey: string) {
    this.unsetNodeStatus(nodeKey, 'hovered');
  }

  private hoverEdge(edgeKey: string) {
    const edge = this.edgeKeyToEdgeObject.get(edgeKey)!;
    if (edge.hovered) {
      return;
    }

    // update style
    edge.hovered = true;
    this.updateEdgeStyleByKey(edgeKey);

    // move to front
    const edgeIndex = this.edgeLayer.getChildIndex(edge.edgeGfx);
    if (edgeIndex >= 0) {
      this.edgeLayer.removeChildAt(edgeIndex);
      this.edgeLabelLayer.removeChildAt(edgeIndex);
      this.frontEdgeLayer.removeChildAt(edgeIndex);
      this.frontEdgeLabelLayer.removeChildAt(edgeIndex);
      this.edgeLayer.addChild(edge.edgePlaceholderGfx);
      this.edgeLabelLayer.addChild(edge.edgeLabelPlaceholderGfx);
      this.frontEdgeLayer.addChild(edge.edgeGfx);
      this.frontEdgeLabelLayer.addChild(edge.edgeLabelGfx);
    }
  }

  private unhoverEdge(edgeKey: string) {
    const edge = this.edgeKeyToEdgeObject.get(edgeKey)!;
    if (!edge.hovered) {
      return;
    }

    // update style
    edge.hovered = false;
    this.updateEdgeStyleByKey(edgeKey);

    // move back
    const edgeIndex = this.frontEdgeLayer.getChildIndex(edge.edgeGfx);
    if (edgeIndex >= 0) {
      this.edgeLayer.removeChildAt(edgeIndex);
      this.edgeLabelLayer.removeChildAt(edgeIndex);
      this.frontEdgeLayer.removeChildAt(edgeIndex);
      this.frontEdgeLabelLayer.removeChildAt(edgeIndex);
      this.edgeLayer.addChild(edge.edgeGfx);
      this.edgeLabelLayer.addChild(edge.edgeLabelGfx);
      this.frontEdgeLayer.addChild(edge.edgePlaceholderGfx);
      this.frontEdgeLabelLayer.addChild(edge.edgeLabelPlaceholderGfx);
    }
  }

  private moveNode(nodeKey: string, point: IPointData) {
    this.graph.setNodeAttribute(nodeKey, 'x', point.x);
    this.graph.setNodeAttribute(nodeKey, 'y', point.y);

    const node = this.nodeKeyToNodeObject.get(nodeKey)!;
    const nodePosition = { x: point.x, y: point.y };
    node.updatePosition(nodePosition);

    // update style
    this.updateNodeStyleByKey(nodeKey);
    this.graph.edges(nodeKey).forEach(this.updateEdgeStyleByKey.bind(this));
  }

  private moveNodebyDelta(nodeKey: string, deltaX: number, deltaY: number) {
    let x = this.graph.getNodeAttribute(nodeKey, 'x') as number;
    let y = this.graph.getNodeAttribute(nodeKey, 'y') as number;

    this.graph.setNodeAttribute(nodeKey, 'x', x + deltaX);
    this.graph.setNodeAttribute(nodeKey, 'y', y + deltaY);

    const node = this.nodeKeyToNodeObject.get(nodeKey)!;
    const nodePosition = { x: x + deltaX, y: y + deltaY };
    node.updatePosition(nodePosition);

    // update style
    this.updateNodeStyleByKey(nodeKey);
    this.graph.edges(nodeKey).forEach(this.updateEdgeStyleByKey.bind(this));
  }

  private enableNodeDragging() {
    this.viewport.pause = true; // disable viewport dragging

    document.addEventListener('mousemove', this.onDocumentMouseMoveBound);
    document.addEventListener('mouseup', this.onDocumentMouseUpBound, { once: true });
  }

  private onDocumentMouseMove(event: MouseEvent) {
    const eventPosition = new Point(event.offsetX, event.offsetY);
    const worldPosition = this.viewport.toWorld(eventPosition);
    if (this.mousedownNodeKey) {
      if (this.selectNodeKeys.has(this.mousedownNodeKey)) {
        let prevX = this.graph.getNodeAttribute(this.mousedownNodeKey, 'x') as number;
        let preY = this.graph.getNodeAttribute(this.mousedownNodeKey, 'y') as number;
        let deltaX = worldPosition.x - prevX;
        let deltaY = worldPosition.y - preY;

        this.selectNodeKeys.forEach((nodeKey) => this.moveNodebyDelta(nodeKey, deltaX, deltaY));
      } else {
        this.moveNode(this.mousedownNodeKey, worldPosition);
      }
    }
  }

  private onDocumentMouseUp() {
    this.viewport.pause = false; // enable viewport dragging

    document.removeEventListener('mousemove', this.onDocumentMouseMoveBound);

    this.mousedownNodeKey = null;
    this.mousedownEdgeKey = null;
  }

  private createGraph() {
    this.graph.forEachNode(this.createNode.bind(this));
    this.graph.forEachEdge(this.createEdge.bind(this));

    // todo
    // when graph change(position change or add/delete new node)
    // should mark related object dirty.
    // @ts-ignore
    // (this.viewport.children as Container[]).map((layer) => this.cull.addList(layer.children));
  }

  private createNode(nodeKey: string, nodeAttributes: NodeAttributes) {
    const node = new PixiNode();
    node.on('mousemove', (event: MouseEvent) => {
      this.emit('nodeMousemove', event, nodeKey);
    });
    node.on('mouseover', (event: MouseEvent) => {
      if (!this.mousedownNodeKey) {
        this.hoverNode(nodeKey);
      }
      this.emit('nodeMouseover', event, nodeKey, node.nodeGfx.getBounds());
    });
    node.on('mouseout', (event: MouseEvent) => {
      if (!this.mousedownNodeKey) {
        this.unhoverNode(nodeKey);
      }
      this.emit('nodeMouseout', event, nodeKey);
    });
    node.on('mousedown', (event: MouseEvent) => {
      this.mousedownNodeKey = nodeKey;
      this.enableNodeDragging();
      this.emit('nodeMousedown', event, nodeKey);
      this.mouseDownPosition = {
        x: event.clientX,
        y: event.clientY,
      };
    });

    node.on('rightdown', (_event: MouseEvent) => {
      this.mousedownNodeKey = nodeKey;
    });
    node.on('rightup', (event: MouseEvent) => {
      if (this.mousedownNodeKey === nodeKey) {
        this.emit('nodeRightClick', event, nodeKey);
      }
      this.mousedownNodeKey = null;
    });

    const doubleClickDelayMs = 350;
    let previousTapStamp = 0;

    node.on('mouseup', (event: MouseEvent) => {
      this.emit('nodeMouseup', event, nodeKey);

      // why native click event doesn't work?
      if (this.mousedownNodeKey === nodeKey && this.mouseDownPosition) {
        let diff =
          Math.sqrt(Math.abs(event.clientX - this.mouseDownPosition.x)) +
          Math.sqrt(Math.abs(event.clientY - this.mouseDownPosition.y));

        if (diff <= 2) {
          if (event.metaKey || event.ctrlKey || event.shiftKey) {
            this.selectNodeKeys.add(nodeKey);
            this.selectNode(nodeKey);
          } else {
            this.selectNodeKeys.forEach((nodeKey) => {
              this.unselectNode(nodeKey);
            });
            this.selectNodeKeys.clear();

            this.selectNodeKeys.add(nodeKey);
            this.selectNode(nodeKey);
          }

          this.emit('nodeClick', event, nodeKey);

          // check for double click
          if (event.shiftKey || event.ctrlKey || event.metaKey) {
            return;
          }

          const currentTapStamp = event.timeStamp;
          const msFromLastTap = currentTapStamp - previousTapStamp;

          previousTapStamp = currentTapStamp;
          if (msFromLastTap < doubleClickDelayMs) {
            this.emit('nodeDoubleClick', event, nodeKey);
            return;
          }
        }
      }
      this.mousedownNodeKey = null;
    });
    this.nodeLayer.addChild(node.nodeGfx);
    this.nodeLabelLayer.addChild(node.nodeLabelGfx);
    this.frontNodeLayer.addChild(node.nodePlaceholderGfx);
    this.frontNodeLabelLayer.addChild(node.nodeLabelPlaceholderGfx);
    this.nodeKeyToNodeObject.set(nodeKey, node);

    const nodePosition = { x: nodeAttributes.x, y: nodeAttributes.y };
    node.updatePosition(nodePosition);

    this.updateNodeStyle(nodeKey, nodeAttributes);
  }

  private createEdge(
    edgeKey: string,
    edgeAttributes: EdgeAttributes,
    sourceNodeKey: string,
    targetNodeKey: string,
    sourceNodeAttributes: NodeAttributes,
    targetNodeAttributes: NodeAttributes
  ) {
    const edge = new PixiEdge();
    edge.on('mousemove', (event: MouseEvent) => {
      this.emit('edgeMousemove', event, edgeKey);
    });
    edge.on('mouseover', (event: MouseEvent) => {
      this.hoverEdge(edgeKey);
      this.emit('edgeMouseover', event, edgeKey);
    });
    edge.on('mouseout', (event: MouseEvent) => {
      this.unhoverEdge(edgeKey);
      this.emit('edgeMouseout', event, edgeKey);
    });
    edge.on('mousedown', (event: MouseEvent) => {
      this.mousedownEdgeKey = edgeKey;
      this.emit('edgeMousedown', event, edgeKey);
    });
    edge.on('mouseup', (event: MouseEvent) => {
      this.emit('edgeMouseup', event, edgeKey);
      // why native click event doesn't work?
      if (this.mousedownEdgeKey === edgeKey) {
        this.emit('edgeClick', event, edgeKey);
      }
    });
    this.edgeLayer.addChild(edge.edgeGfx);
    this.edgeLabelLayer.addChild(edge.edgeLabelGfx);
    this.frontEdgeLayer.addChild(edge.edgePlaceholderGfx);
    this.frontEdgeLabelLayer.addChild(edge.edgeLabelPlaceholderGfx);
    this.edgeKeyToEdgeObject.set(edgeKey, edge);

    this.updateEdgeStyle(
      edgeKey,
      edgeAttributes,
      sourceNodeKey,
      targetNodeKey,
      sourceNodeAttributes,
      targetNodeAttributes
    );
  }

  private dropNode(nodeKey: string) {
    const node = this.nodeKeyToNodeObject.get(nodeKey)!;

    this.nodeLayer.removeChild(node.nodeGfx);
    this.nodeLabelLayer.removeChild(node.nodeLabelGfx);
    this.frontNodeLayer.removeChild(node.nodePlaceholderGfx);
    this.frontNodeLabelLayer.removeChild(node.nodeLabelPlaceholderGfx);
    this.nodeKeyToNodeObject.delete(nodeKey);
  }

  private dropEdge(edgeKey: string) {
    const edge = this.edgeKeyToEdgeObject.get(edgeKey)!;

    this.edgeLayer.removeChild(edge.edgeGfx);
    this.edgeLabelLayer.removeChild(edge.edgeLabelGfx);
    this.frontEdgeLayer.removeChild(edge.edgePlaceholderGfx);
    this.frontEdgeLabelLayer.removeChild(edge.edgeLabelPlaceholderGfx);
    this.edgeKeyToEdgeObject.delete(edgeKey);
  }

  private updateNodeStyleByKey(nodeKey: string) {
    const nodeAttributes = this.graph.getNodeAttributes(nodeKey);
    this.updateNodeStyle(nodeKey, nodeAttributes);
  }

  private updateNodeStyle(nodeKey: string, nodeAttributes: NodeAttributes) {
    const node = this.nodeKeyToNodeObject.get(nodeKey)!;

    let stateStyle: NodeStyleDefinition<NodeAttributes> | undefined = undefined;
    if (node.selected) {
      stateStyle = this.selectStyle.node;
    } else if (node.hovered) {
      stateStyle = this.hoverStyle.node;
    }

    const nodeStyleDefinitions = [DEFAULT_STYLE.node, this.style.node, stateStyle];
    const nodeStyle = resolveStyleDefinitions(nodeStyleDefinitions, nodeAttributes);
    node.updateStyle(nodeStyle, this.textureCache);
  }

  private updateEdgeStyleByKey(edgeKey: string) {
    const edgeAttributes = this.graph.getEdgeAttributes(edgeKey);
    const sourceNodeKey = this.graph.source(edgeKey);
    const targetNodeKey = this.graph.target(edgeKey);
    const sourceNodeAttributes = this.graph.getNodeAttributes(sourceNodeKey);
    const targetNodeAttributes = this.graph.getNodeAttributes(targetNodeKey);
    this.updateEdgeStyle(
      edgeKey,
      edgeAttributes,
      sourceNodeKey,
      targetNodeKey,
      sourceNodeAttributes,
      targetNodeAttributes
    );
  }

  private updateEdgeStyle(
    edgeKey: string,
    edgeAttributes: EdgeAttributes,
    sourceNodeKey: string,
    targetNodeKey: string,
    _sourceNodeAttributes: NodeAttributes,
    targetNodeAttributes: NodeAttributes
  ) {
    const key = `${sourceNodeKey}_${targetNodeKey}`;
    const parallelEdgeCount = this.parallelEdgeMap.get(key) || 1;
    const parallelSeq = this.graph.getEdgeAttribute(edgeKey, 'parallelSeq') as number;

    const isDirected = this.graph.isDirected(edgeKey);

    const edge = this.edgeKeyToEdgeObject.get(edgeKey)!;
    const sourceNode = this.nodeKeyToNodeObject.get(sourceNodeKey)!;
    const targetNode = this.nodeKeyToNodeObject.get(targetNodeKey)!;

    const sourceNodePosition = { x: sourceNode.nodeGfx.position.x, y: sourceNode.nodeGfx.position.y };
    const targetNodePosition = { x: targetNode.nodeGfx.position.x, y: targetNode.nodeGfx.position.y };

    const nodeStyleDefinitions = [DEFAULT_STYLE.node, this.style.node];
    const nodeStyle = resolveStyleDefinitions(nodeStyleDefinitions, targetNodeAttributes);

    const edgeStyleDefinitions = [DEFAULT_STYLE.edge, this.style.edge, edge.hovered ? this.hoverStyle.edge : undefined];
    const edgeStyle = resolveStyleDefinitions(edgeStyleDefinitions, edgeAttributes);

    edge.updatePosition(
      sourceNodePosition,
      targetNodePosition,
      nodeStyle,
      edgeStyle,
      this.textureCache,
      isDirected,
      sourceNodeKey === targetNodeKey,
      parallelEdgeCount,
      parallelSeq
    );

    edge.updateStyle(
      edgeStyle,
      this.textureCache,
      isDirected,
      sourceNodeKey === targetNodeKey,
      parallelEdgeCount,
      parallelSeq
    );
  }

  private updateGraphVisibility() {
    // culling todo(rotation cull have bug)
    // https://github.com/davidfig/pixi-cull/issues/2
    // this.cull.cull(this.viewport.getVisibleBounds(), false);
    // should refer https://github.com/ShukantPal/pixi-essentials/tree/master/packages/cull

    // original culling have performance issue.
    const cull = new Cull();
    cull.addAll((this.viewport.children as Container[]).map((layer) => layer.children).flat());
    cull.cull(this.app.renderer.screen);

    // console.log(
    //   Array.from((cull as any)._targetList as Set<DisplayObject>).filter(x => x.visible === true).length,
    //   Array.from((cull as any)._targetList as Set<DisplayObject>).filter(x => x.visible === false).length
    // );

    // levels of detail
    const zoom = this.viewport.scale.x;
    const zoomSteps = [0.1, 0.2, 0.4, Infinity];
    const zoomStep = zoomSteps.findIndex((zoomStep) => zoom <= zoomStep);
    console.log(zoom, zoomStep);

    // zoomStep = 0, zoom <= 0.1
    //    node background
    // zoomStep = 1,    0.1 < zoom <= 0.2
    //    node border
    // zoomStep = 2, 0.2 < zoom <= 0.4
    //    node icon
    //    edge (line/parallel edge/self loop edge)
    // zoomStep = 3,  0.4 < zoom < Infinity
    //    node label
    //    edge arrow

    this.graph.forEachNode((nodeKey) => {
      const node = this.nodeKeyToNodeObject.get(nodeKey)!;
      node.updateVisibility(zoomStep);
    });

    this.graph.forEachEdge(
      (edgeKey: string, _edgeAttributes: EdgeAttributes, sourceNodeKey: string, targetNodeKey: string) => {
        const key = `${sourceNodeKey}_${targetNodeKey}`;
        const parallelEdgeCount = this.parallelEdgeMap.get(key) || 0;
        const parallelSeq = this.graph.getEdgeAttribute(edgeKey, 'parallelSeq') as number;

        const edge = this.edgeKeyToEdgeObject.get(edgeKey)!;
        edge.updateVisibility(zoomStep, sourceNodeKey === targetNodeKey, parallelEdgeCount, parallelSeq);
      }
    );
  }
}
