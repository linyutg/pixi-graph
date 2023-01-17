import { Text } from '@pixi/text';
import { BitmapText, BitmapFontLoader } from '@pixi/text-bitmap';
import { Application } from '@pixi/app';
import { TickerPlugin } from '@pixi/ticker';
import { AppLoaderPlugin, Loader } from '@pixi/loaders';
import { Texture, Renderer, BatchRenderer } from '@pixi/core';
import { InteractionManager } from '@pixi/interaction';
import { Container } from '@pixi/display';
import { Rectangle, Circle, Polygon, Point } from '@pixi/math';
import { Viewport } from 'pixi-viewport';
import { Cull } from '@pixi-essentials/cull';
import { TypedEmitter } from 'tiny-typed-emitter';
import { SmoothGraphics, settings, LINE_SCALE_MODE } from '@pixi/graphics-smooth';
import { DagreLayout, GridLayout, ConcentricLayout, CircularLayout } from '@antv/layout';
import FA2Layout from 'graphology-layout-forceatlas2/worker';
import deepmerge from 'deepmerge';
import { SCALE_MODES } from '@pixi/constants';
import { Sprite } from '@pixi/sprite';
import '@pixi/mixin-get-child-by-name';
import { rgb2hex } from '@pixi/utils';
import rgba from 'color-rgba';
import { GRAPHICS_CURVES } from '@pixi/graphics';

var WHITE$2 = 0xffffff;
var TextType;
(function (TextType) {
    TextType["TEXT"] = "TEXT";
    TextType["BITMAP_TEXT"] = "BITMAP_TEXT";
    // TODO: SDF_TEXT
    // see https://github.com/PixelsCommander/pixi-sdf-text/issues/12
})(TextType || (TextType = {}));
// for antialias: BITMAP_TEXT is much better than TEXT
function textToPixi(type, content, style) {
    var text;
    if (type === TextType.TEXT) {
        // TODO: convert to bitmap font with BitmapFont.from?
        text = new Text(content, {
            fontFamily: style.fontFamily,
            fontSize: style.fontSize,
            fill: WHITE$2,
        });
    }
    else if (type === TextType.BITMAP_TEXT) {
        text = new BitmapText(content, {
            fontName: style.fontFamily,
            fontSize: style.fontSize,
        });
    }
    else {
        throw new Error('Invalid state');
    }
    text.roundPixels = true;
    return text;
}

/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
/* global Reflect, Promise */

var extendStatics = function(d, b) {
    extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
    return extendStatics(d, b);
};

function __extends(d, b) {
    if (typeof b !== "function" && b !== null)
        throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
    extendStatics(d, b);
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
}

// the ForceAtlas2Layout from @antv/layout is slow
var ForceAtlas2Layout = /** @class */ (function () {
    function ForceAtlas2Layout(options) {
        this.options = options;
    }
    ForceAtlas2Layout.prototype.runLayout = function (graph) {
        var layout = new FA2Layout(graph, {
            settings: this.options,
        });
        // To start the layout
        layout.start();
        this.layout = layout;
    };
    ForceAtlas2Layout.prototype.stopLayout = function () {
        var _a;
        (_a = this.layout) === null || _a === void 0 ? void 0 : _a.stop();
    };
    ForceAtlas2Layout.prototype.isRunning = function () {
        var _a;
        return (_a = this.layout) === null || _a === void 0 ? void 0 : _a.isRunning();
    };
    ForceAtlas2Layout.prototype.kill = function () {
        var _a;
        (_a = this.layout) === null || _a === void 0 ? void 0 : _a.kill();
    };
    return ForceAtlas2Layout;
}());

function resolveStyleDefinition(styleDefinition, attributes) {
    var style;
    if (styleDefinition instanceof Function) {
        style = styleDefinition(attributes);
    }
    else if (typeof styleDefinition === 'object' && styleDefinition !== null) {
        style = Object.fromEntries(Object.entries(styleDefinition).map(function (_a) {
            var key = _a[0], styleDefinition = _a[1];
            return [key, resolveStyleDefinition(styleDefinition, attributes)];
        }));
    }
    else {
        style = styleDefinition;
    }
    return style;
}
function resolveStyleDefinitions(styleDefinitions, attributes) {
    var styles = styleDefinitions
        .filter(function (x) { return !!x; })
        .map(function (styleDefinition) { return resolveStyleDefinition(styleDefinition, attributes); });
    var style = deepmerge.all(styles);
    return style;
}

var TextureCache = /** @class */ (function () {
    function TextureCache(renderer) {
        this.textures = new Map();
        this.renderer = renderer;
    }
    TextureCache.prototype.get = function (key, defaultCallback) {
        var texture = this.textures.get(key);
        if (!texture) {
            var container = defaultCallback();
            var region = container.getLocalBounds(undefined, true);
            var roundedRegion = new Rectangle(Math.floor(region.x), Math.floor(region.y), Math.ceil(region.width), Math.ceil(region.height));
            texture = this.renderer.generateTexture(container, SCALE_MODES.LINEAR, 
            // we want to support better texture antialias
            // so we generate high resolution texture here
            this.renderer.resolution * 4, roundedRegion);
            this.textures.set(key, texture);
        }
        return texture;
    };
    TextureCache.prototype.delete = function (key) {
        var texture = this.textures.get(key);
        if (!texture) {
            return;
        }
        texture.destroy();
        this.textures.delete(key);
    };
    TextureCache.prototype.clear = function () {
        var _this = this;
        Array.from(this.textures.keys()).forEach(function (key) {
            _this.delete(key);
        });
    };
    TextureCache.prototype.destroy = function () {
        this.clear();
    };
    return TextureCache;
}());

function colorToPixi(color) {
    var rgbaColor = rgba(color);
    if (!rgbaColor) {
        throw new Error("Invalid color " + color);
    }
    var pixiColor = rgb2hex([rgbaColor[0] / 255, rgbaColor[1] / 255, rgbaColor[2] / 255]);
    var alpha = rgbaColor[3];
    return [pixiColor, alpha];
}

var DELIMETER$3 = '::';
var WHITE$1 = 0xffffff;
var NODE_CIRCLE = 'NODE_CIRCLE';
var NODE_CIRCLE_BORDER = 'NODE_CIRCLE_BORDER';
var NODE_ICON = 'NODE_ICON';
function createNode(nodeGfx) {
    // nodeGfx
    nodeGfx.hitArea = new Circle(0, 0);
    // nodeGfx -> nodeCircle
    var nodeCircle = new Sprite();
    nodeCircle.name = NODE_CIRCLE;
    nodeCircle.anchor.set(0.5);
    nodeGfx.addChild(nodeCircle);
    // nodeGfx -> nodeCircleBorder
    var nodeCircleBorder = new Sprite();
    nodeCircleBorder.name = NODE_CIRCLE_BORDER;
    nodeCircleBorder.anchor.set(0.5);
    nodeGfx.addChild(nodeCircleBorder);
    // nodeGfx -> nodeIcon
    var nodeIcon = new Sprite();
    nodeIcon.name = NODE_ICON;
    nodeIcon.anchor.set(0.5);
    nodeGfx.addChild(nodeIcon);
}
function updateNodeStyle(nodeGfx, nodeStyle, textureCache) {
    var _a, _b;
    var nodeOuterSize = nodeStyle.size + nodeStyle.border.width;
    var nodeCircleTextureKey = [NODE_CIRCLE, nodeStyle.size].join(DELIMETER$3);
    var nodeCircleTexture = textureCache.get(nodeCircleTextureKey, function () {
        var graphics = new SmoothGraphics();
        graphics.beginFill(WHITE$1, 1.0, true);
        graphics.drawCircle(nodeStyle.size, nodeStyle.size, nodeStyle.size);
        return graphics;
    });
    var nodeCircleBorderTextureKey = [NODE_CIRCLE_BORDER, nodeStyle.size, nodeStyle.border.width].join(DELIMETER$3);
    var nodeCircleBorderTexture = textureCache.get(nodeCircleBorderTextureKey, function () {
        var graphics = new SmoothGraphics();
        graphics.lineStyle(nodeStyle.border.width, WHITE$1);
        graphics.drawCircle(nodeOuterSize, nodeOuterSize, nodeStyle.size);
        return graphics;
    });
    // nodeGfx
    nodeGfx.hitArea.radius = nodeOuterSize;
    // nodeGfx -> nodeCircle
    var nodeCircle = nodeGfx.getChildByName(NODE_CIRCLE);
    nodeCircle.texture = nodeCircleTexture;
    _a = colorToPixi(nodeStyle.color), nodeCircle.tint = _a[0], nodeCircle.alpha = _a[1];
    // nodeGfx -> nodeCircleBorder
    var nodeCircleBorder = nodeGfx.getChildByName(NODE_CIRCLE_BORDER);
    nodeCircleBorder.texture = nodeCircleBorderTexture;
    _b = colorToPixi(nodeStyle.border.color), nodeCircleBorder.tint = _b[0], nodeCircleBorder.alpha = _b[1];
    // nodeGfx -> nodeIcon
    if (nodeStyle.icon.url && nodeStyle.icon.width && nodeStyle.icon.height) {
        var nodeIcon = nodeGfx.getChildByName(NODE_ICON);
        nodeIcon.texture = Texture.from(nodeStyle.icon.url);
        nodeIcon.width = nodeStyle.icon.width;
        nodeIcon.height = nodeStyle.icon.height;
        nodeGfx.addChild(nodeIcon);
    }
}
function updateNodeVisibility(nodeGfx, zoomStep) {
    // nodeGfx -> nodeCircleBorder
    var nodeCircleBorder = nodeGfx.getChildByName(NODE_CIRCLE_BORDER);
    nodeCircleBorder.visible = zoomStep >= 1;
    // nodeGfx -> nodeIcon
    var nodeIcon = nodeGfx.getChildByName(NODE_ICON);
    if (nodeIcon) {
        nodeIcon.visible = zoomStep >= 2;
    }
}

var DELIMETER$2 = '::';
var NODE_LABEL_TEXT = 'NODE_LABEL_TEXT';
function createNodeLabel(nodeLabelGfx) {
    // nodeLabelGfx -> nodeLabelText
    var nodeLabelText = new Sprite();
    nodeLabelText.name = NODE_LABEL_TEXT;
    nodeLabelText.anchor.set(0.5);
    nodeLabelGfx.addChild(nodeLabelText);
}
function updateNodeLabelStyle(nodeLabelGfx, nodeStyle, textureCache) {
    var _a;
    var nodeLabelTextTextureKey = [
        NODE_LABEL_TEXT,
        nodeStyle.label.fontFamily,
        nodeStyle.label.fontSize,
        nodeStyle.label.content,
    ].join(DELIMETER$2);
    var nodeLabelTextTexture = textureCache.get(nodeLabelTextTextureKey, function () {
        var text = textToPixi(nodeStyle.label.type, nodeStyle.label.content, {
            fontFamily: nodeStyle.label.fontFamily,
            fontSize: nodeStyle.label.fontSize,
        });
        return text;
    });
    // nodeLabelGfx -> nodeLabelText
    var nodeLabelText = nodeLabelGfx.getChildByName(NODE_LABEL_TEXT);
    nodeLabelText.texture = nodeLabelTextTexture;
    nodeLabelText.y = nodeStyle.size + (nodeLabelTextTexture.height + nodeStyle.label.padding * 2) / 2;
    _a = colorToPixi(nodeStyle.label.color), nodeLabelText.tint = _a[0], nodeLabelText.alpha = _a[1];
}
function updateNodeLabelVisibility(nodeLabelGfx, zoomStep) {
    // nodeLabelGfx -> nodeLabelText
    var nodeLabelText = nodeLabelGfx.getChildByName(NODE_LABEL_TEXT);
    nodeLabelText.visible = zoomStep >= 3;
}

var PixiNode = /** @class */ (function (_super) {
    __extends(PixiNode, _super);
    function PixiNode() {
        var _this = _super.call(this) || this;
        _this.hovered = false;
        _this.selected = false;
        _this.nodeGfx = _this.createNode();
        _this.nodeLabelGfx = _this.createNodeLabel();
        _this.nodePlaceholderGfx = new Container();
        _this.nodeLabelPlaceholderGfx = new Container();
        return _this;
    }
    PixiNode.prototype.createNode = function () {
        var _this = this;
        var nodeGfx = new Container();
        nodeGfx.interactive = true;
        nodeGfx.buttonMode = true;
        nodeGfx.on('mousemove', function (event) {
            return _this.emit('mousemove', event.data.originalEvent);
        });
        nodeGfx.on('mouseover', function (event) {
            return _this.emit('mouseover', event.data.originalEvent);
        });
        nodeGfx.on('mouseout', function (event) { return _this.emit('mouseout', event.data.originalEvent); });
        nodeGfx.on('mousedown', function (event) {
            return _this.emit('mousedown', event.data.originalEvent);
        });
        nodeGfx.on('mouseup', function (event) { return _this.emit('mouseup', event.data.originalEvent); });
        nodeGfx.on('rightdown', function (event) {
            return _this.emit('rightdown', event.data.originalEvent);
        });
        nodeGfx.on('rightup', function (event) { return _this.emit('rightup', event.data.originalEvent); });
        createNode(nodeGfx);
        return nodeGfx;
    };
    PixiNode.prototype.createNodeLabel = function () {
        var nodeLabelGfx = new Container();
        // disable event no nodeLabel
        // nodeLabelGfx.interactive = false;
        // nodeLabelGfx.buttonMode = false;
        // nodeLabelGfx.on('mousemove', (event: InteractionEvent) =>
        //   this.emit('mousemove', event.data.originalEvent as MouseEvent)
        // );
        // nodeLabelGfx.on('mouseover', (event: InteractionEvent) =>
        //   this.emit('mouseover', event.data.originalEvent as MouseEvent)
        // );
        // nodeLabelGfx.on('mouseout', (event: InteractionEvent) =>
        //   this.emit('mouseout', event.data.originalEvent as MouseEvent)
        // );
        // nodeLabelGfx.on('mousedown', (event: InteractionEvent) =>
        //   this.emit('mousedown', event.data.originalEvent as MouseEvent)
        // );
        // nodeLabelGfx.on('mouseup', (event: InteractionEvent) =>
        //   this.emit('mouseup', event.data.originalEvent as MouseEvent)
        // );
        createNodeLabel(nodeLabelGfx);
        return nodeLabelGfx;
    };
    PixiNode.prototype.updatePosition = function (position) {
        this.nodeGfx.position.copyFrom(position);
        this.nodeLabelGfx.position.copyFrom(position);
    };
    PixiNode.prototype.updateStyle = function (nodeStyle, textureCache) {
        updateNodeStyle(this.nodeGfx, nodeStyle, textureCache);
        updateNodeLabelStyle(this.nodeLabelGfx, nodeStyle, textureCache);
    };
    PixiNode.prototype.updateVisibility = function (zoomStep) {
        updateNodeVisibility(this.nodeGfx, zoomStep);
        updateNodeLabelVisibility(this.nodeLabelGfx, zoomStep);
    };
    return PixiNode;
}(TypedEmitter));

/// refer:
//  1: https://codepen.io/IndependentSw/pen/mLZzGj
//  2: https://math.stackexchange.com/questions/885292/how-to-take-derivative-of-bezier-function
function getCubicBezierXY(t, sx, sy, cp1x, cp1y, cp2x, cp2y, ex, ey) {
    return {
        x: Math.pow(1 - t, 3) * sx + 3 * t * Math.pow(1 - t, 2) * cp1x + 3 * t * t * (1 - t) * cp2x + t * t * t * ex,
        y: Math.pow(1 - t, 3) * sy + 3 * t * Math.pow(1 - t, 2) * cp1y + 3 * t * t * (1 - t) * cp2y + t * t * t * ey,
    };
}
function getCubicBezierAngle(t, sx, sy, cp1x, cp1y, cp2x, cp2y, ex, ey) {
    var dx = Math.pow(1 - t, 2) * (cp1x - sx) + 2 * t * (1 - t) * (cp2x - cp1x) + t * t * (ex - cp2x);
    var dy = Math.pow(1 - t, 2) * (cp1y - sy) + 2 * t * (1 - t) * (cp2y - cp1y) + t * t * (ey - cp2y);
    return -Math.atan2(dx, dy) + 0.5 * Math.PI;
}
function getQuadraticBezierXY(t, sx, sy, cp1x, cp1y, ex, ey) {
    return {
        x: Math.pow(1 - t, 2) * sx + 2 * (1 - t) * t * cp1x + t * t * ex,
        y: Math.pow(1 - t, 2) * sy + 2 * (1 - t) * t * cp1y + t * t * ey,
    };
}
function getQuadraticAngle(t, sx, sy, cp1x, cp1y, ex, ey) {
    var dx = 2 * (1 - t) * (cp1x - sx) + 2 * t * (ex - cp1x);
    var dy = 2 * (1 - t) * (cp1y - sy) + 2 * t * (ey - cp1y);
    return -Math.atan2(dx, dy) + 0.5 * Math.PI;
}
function getQuadraticStartEndPoint(nodeSize, degree, sx, sy, ex, ey) {
    var radian = (degree / 180) * Math.PI;
    return {
        sx: sx + nodeSize * Math.cos(radian),
        sy: sy + nodeSize * Math.sin(radian),
        ex: ex + nodeSize * Math.cos(radian) * -1,
        ey: ey + nodeSize * Math.sin(radian),
    };
}
function getLoopEdgeBezierPoint(nodeSize, parallelSeq, x, y) {
    // x goes from left to right
    // y goes from up to down
    // so we choose start at 270 and end at 180
    var degreeStart = 270 + (parallelSeq - 1) * 5;
    var radianStart = (degreeStart / 180) * Math.PI;
    var degreeEnd = 180 - (parallelSeq - 1) * 5;
    var radianEnd = (degreeEnd / 180) * Math.PI;
    var sx = x + nodeSize * Math.cos(radianStart);
    var sy = y + nodeSize * Math.sin(radianStart);
    var ex = x + nodeSize * Math.cos(radianEnd);
    var ey = y + nodeSize * Math.sin(radianEnd);
    // logic copied from cytoscape
    var len = 50 * parallelSeq * (parallelSeq / 3 + 1);
    var cp1x = x + (nodeSize + len) * Math.cos(radianStart);
    var cp1y = y + (nodeSize + len) * Math.sin(radianStart);
    var cp2x = x + (nodeSize + len) * Math.cos(radianEnd);
    var cp2y = y + (nodeSize + len) * Math.sin(radianEnd);
    return {
        sx: sx,
        sy: sy,
        cp1x: cp1x,
        cp1y: cp1y,
        cp2x: cp2x,
        cp2y: cp2y,
        ex: ex,
        ey: ey,
    };
}
function getPolygonPoints(width, edgePoints) {
    var numPoints = edgePoints.length / 2;
    var output = new Array(edgePoints.length * 2);
    for (var i = 0; i < numPoints; i++) {
        var j = i * 2;
        // Position of current point
        var x = edgePoints[j];
        var y = edgePoints[j + 1];
        // Start
        var x0 = edgePoints[j - 2] !== undefined ? edgePoints[j - 2] : x;
        var y0 = edgePoints[j - 1] !== undefined ? edgePoints[j - 1] : y;
        // End
        var x1 = edgePoints[j + 2] !== undefined ? edgePoints[j + 2] : x;
        var y1 = edgePoints[j + 3] !== undefined ? edgePoints[j + 3] : y;
        // Get the angle of the line
        var a = Math.atan2(-x1 + x0, y1 - y0);
        var deltaX = width * Math.cos(a);
        var deltaY = width * Math.sin(a);
        // Add the x, y at the beginning
        output[j] = x + deltaX;
        output[j + 1] = y + deltaY;
        // Add the reflected x, y at the end
        output[output.length - 1 - j - 1] = x - deltaX;
        output[output.length - 1 - j] = y - deltaY;
    }
    // close the shape
    output.push(output[0], output[1]);
    return output;
}

GRAPHICS_CURVES.minSegments = 8 * 8;
var DELIMETER$1 = '::';
var WHITE = 0xffffff;
var EDGE_LINE = 'EDGE_LINE';
var EDGE_ARROW = 'EDGE_ARROW';
var EDGE_CURVE = 'EDGE_CURVE';
var EDGE_CURVE_ARROW = 'EDGE_CURVE_ARROW';
var ARROW_SIZE = 5;
function createEdge(edgeGfx) {
    // edgeGfx -> edgeLine
    var edgeLine = new Sprite(Texture.WHITE);
    edgeLine.name = EDGE_LINE;
    edgeLine.anchor.set(0.5);
    edgeGfx.addChild(edgeLine);
    // edgeGfx -> edgeArrow
    var edgeArrow = new Sprite();
    edgeArrow.name = EDGE_ARROW;
    edgeArrow.anchor.set(0, 0.5);
    edgeGfx.addChild(edgeArrow);
    // edgeGfx -> edgeCurve
    var edgeCurve = new SmoothGraphics();
    edgeCurve.name = EDGE_CURVE;
    edgeGfx.addChild(edgeCurve);
    // edgeGfx -> edgeArrow
    var edgeCurveArrow = new SmoothGraphics();
    edgeCurveArrow.name = EDGE_CURVE_ARROW;
    edgeGfx.addChild(edgeCurveArrow);
}
function updateEdgePosition(edgeGfx, sourceNodePosition, targetNodePosition, nodeStyle, edgeStyle, textureCache, isDirected, isSelfLoop, parallelEdgeCount, parallelSeq) {
    var _a;
    var nodeSize = nodeStyle.size;
    var _b = colorToPixi(edgeStyle.color), color = _b[0], alpha = _b[1];
    var length = Math.hypot(targetNodePosition.x - sourceNodePosition.x, targetNodePosition.y - sourceNodePosition.y);
    var edgeLine = edgeGfx.getChildByName(EDGE_LINE);
    var edgeArrow = edgeGfx.getChildByName(EDGE_ARROW);
    var edgeCurve = edgeGfx.getChildByName(EDGE_CURVE);
    var edgeCurveArrow = edgeGfx.getChildByName(EDGE_CURVE_ARROW);
    edgeLine.visible = false;
    edgeArrow.visible = false;
    edgeCurve.visible = false;
    edgeCurveArrow.visible = false;
    if (isSelfLoop) {
        edgeCurve.visible = true;
        edgeCurveArrow.visible = true;
        var _c = getLoopEdgeBezierPoint(nodeSize, parallelSeq, 0, 0), sx = _c.sx, sy = _c.sy, cp1x = _c.cp1x, cp1y = _c.cp1y, cp2x = _c.cp2x, cp2y = _c.cp2y, ex = _c.ex, ey = _c.ey;
        // only do clear when node position changed
        edgeCurve.clear();
        edgeCurve.lineStyle({ width: edgeStyle.width, color: color, alpha: alpha });
        edgeCurve.moveTo(sx, sy);
        edgeCurve.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, ex, ey);
        // set hit area
        changeHitArea(edgeCurve, edgeStyle.width);
        // edgeGfx -> edgeCurveArrow
        // only do clear when node position changed
        edgeCurveArrow.clear();
        var coord = getCubicBezierXY(1, sx, sy, cp1x, cp1y, cp2x, cp2y, ex, ey);
        var angle = getCubicBezierAngle(1, sx, sy, cp1x, cp1y, cp2x, cp2y, ex, ey);
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
            var edgeArrowTextureKey = [EDGE_ARROW].join(DELIMETER$1);
            var edgeArrowTexture = textureCache.get(edgeArrowTextureKey, function () {
                var graphics = new SmoothGraphics();
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
            _a = colorToPixi(edgeStyle.color), edgeArrow.tint = _a[0], edgeArrow.alpha = _a[1];
        }
    }
    else {
        edgeCurve.visible = true;
        edgeCurveArrow.visible = true;
        // edgeGfx -> edgeCurve
        var dir = parallelSeq % 2 === 0 ? 1 : -1;
        var seqInDir = Math.ceil(parallelSeq / 2);
        var _d = getQuadraticStartEndPoint(nodeSize, 5 * seqInDir * dir, -length / 2, 0, length / 2, 0), sx = _d.sx, sy = _d.sy, ex = _d.ex, ey = _d.ey;
        var curveHeight = length * 0.25 * seqInDir * dir;
        // only do clear when node position changed
        edgeCurve.clear();
        edgeCurve.lineStyle({ width: 1, color: color, alpha: alpha });
        edgeCurve.moveTo(sx, sy);
        edgeCurve.quadraticCurveTo(0, curveHeight, ex, ey);
        // set hit area
        changeHitArea(edgeCurve, edgeStyle.width);
        // edgeGfx -> edgeCurveArrow
        // only do clear when node position changed
        edgeCurveArrow.clear();
        var coord = getQuadraticBezierXY(1, sx, sy, 0, curveHeight, ex, ey);
        var angle = getQuadraticAngle(1, sx, sy, 0, curveHeight, ex, ey);
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
function updateEdgeStyle(edgeGfx, edgeStyle, _textureCache, _isDirected, isSelfLoop, parallelEdgeCount, parallelSeq) {
    var _a;
    if (isStraightLine(isSelfLoop, parallelEdgeCount, parallelSeq)) {
        // edgeGfx -> edgeLine
        var edgeLine = edgeGfx.getChildByName(EDGE_LINE);
        edgeLine.height = edgeStyle.width;
        _a = colorToPixi(edgeStyle.color), edgeLine.tint = _a[0], edgeLine.alpha = _a[1];
    }
    else {
        var _b = colorToPixi(edgeStyle.color), color = _b[0], alpha = _b[1];
        var edgeCurve = edgeGfx.getChildByName(EDGE_CURVE);
        edgeCurve.lineStyle({ width: edgeStyle.width, color: color, alpha: alpha });
    }
}
function updateEdgeVisibility(edgeGfx, zoomStep, isSelfLoop, parallelEdgeCount, parallelSeq) {
    var edgeLine = edgeGfx.getChildByName(EDGE_LINE);
    var edgeArrow = edgeGfx.getChildByName(EDGE_ARROW);
    var edgeCurve = edgeGfx.getChildByName(EDGE_CURVE);
    var edgeCurveArrow = edgeGfx.getChildByName(EDGE_CURVE_ARROW);
    if (isStraightLine(isSelfLoop, parallelEdgeCount, parallelSeq)) {
        // edgeGfx -> edgeLine
        edgeLine.visible = zoomStep >= 2;
        // edgeGFX -> edgeArrow
        edgeArrow.visible = zoomStep >= 3;
        // hide curve
        edgeCurve.visible = false;
        edgeCurveArrow.visible = false;
    }
    else {
        // edgeGfx -> edgeCurve
        edgeCurve.visible = zoomStep >= 2;
        // edgeGfx -> edgeCurveArrow
        edgeCurveArrow.visible = zoomStep >= 3;
        // hide line
        edgeLine.visible = false;
        edgeArrow.visible = false;
    }
}
function isStraightLine(isSelfLoop, parallelEdgeCount, parallelSeq) {
    if (isSelfLoop) {
        return false;
    }
    return parallelEdgeCount <= 1 || (parallelEdgeCount % 2 === 1 && parallelSeq === parallelEdgeCount);
}
function changeHitArea(edgeCurve, width) {
    var edgePoints = edgeCurve.currentPath.points;
    var ploygonPoints = getPolygonPoints(width, edgePoints);
    var shape = new Polygon(ploygonPoints);
    edgeCurve.hitArea = shape;
}

var DELIMETER = '::';
var EDGE_LABEL_TEXT = 'EDGE_LABEL_TEXT';
function createEdgeLabel(edgeLabelGfx) {
    // edgeLabelGfx -> edgeLabelText
    var edgeLabelText = new Sprite();
    edgeLabelText.name = EDGE_LABEL_TEXT;
    edgeLabelText.anchor.set(0.5);
    edgeLabelGfx.addChild(edgeLabelText);
}
// !!! the label placement should keep consistent with edge line placement
function updateLabelPosition(edgeLabelGfx, sourceNodePosition, targetNodePosition, nodeStyle, edgeStyle, textureCache, _isDirected, isSelfLoop, parallelEdgeCount, parallelSeq, selfLoopHeight // only for self loop edge
) {
    var _a;
    var nodeSize = nodeStyle.size;
    var length = Math.hypot(targetNodePosition.x - sourceNodePosition.x, targetNodePosition.y - sourceNodePosition.y);
    var labelDir = edgeLabelGfx.rotation >= -Math.PI / 2 && edgeLabelGfx.rotation <= Math.PI / 2 ? 1 : -1;
    var edgeLabelText = edgeLabelGfx.getChildByName(EDGE_LABEL_TEXT);
    var edgeLabelTextTextureKey = [
        EDGE_LABEL_TEXT,
        edgeStyle.label.fontFamily,
        edgeStyle.label.fontSize,
        edgeStyle.label.content,
    ].join(DELIMETER);
    var edgeLabelTextTexture = textureCache.get(edgeLabelTextTextureKey, function () {
        var text = textToPixi(edgeStyle.label.type, edgeStyle.label.content, {
            fontFamily: edgeStyle.label.fontFamily,
            fontSize: edgeStyle.label.fontSize,
        });
        return text;
    });
    edgeLabelText.texture = edgeLabelTextTexture;
    // if dir is -1, we rotation the text, it make label easier to read.
    edgeLabelText.rotation = labelDir > 0 ? 0 : Math.PI;
    // see bezier.ts: y goes from up to down
    var y = 0;
    if (isSelfLoop) {
        y = selfLoopHeight + (-(edgeLabelTextTexture.height + edgeStyle.label.padding * 2) / 2) * labelDir;
    }
    else if (parallelEdgeCount <= 1 || (parallelEdgeCount % 2 === 1 && parallelSeq === parallelEdgeCount)) {
        y = (-(edgeLabelTextTexture.height + edgeStyle.label.padding * 2) / 2) * labelDir;
    }
    else {
        var dir = parallelSeq % 2 === 0 ? 1 : -1;
        var seqInDir = Math.ceil(parallelSeq / 2);
        var curveHeight = length * 0.25 * seqInDir * dir;
        var _b = getQuadraticStartEndPoint(nodeSize, 5 * seqInDir * dir, -length / 2, 0, length / 2, 0), sx = _b.sx, sy = _b.sy, ex = _b.ex, ey = _b.ey;
        var center = getQuadraticBezierXY(0.5, sx, sy, 0, curveHeight, ex, ey);
        y = center.y + (-(edgeLabelTextTexture.height + edgeStyle.label.padding * 2) / 2) * labelDir;
    }
    edgeLabelText.y = y;
    _a = colorToPixi(edgeStyle.label.color), edgeLabelText.tint = _a[0], edgeLabelText.alpha = _a[1];
}
function updateEdgeLabelVisibility(edgeLabelGfx, zoomStep) {
    // edgeLabelGfx -> edgeLabelText
    var edgeLabelText = edgeLabelGfx.getChildByName(EDGE_LABEL_TEXT);
    edgeLabelText.visible = zoomStep >= 3;
}

var PixiEdge = /** @class */ (function (_super) {
    __extends(PixiEdge, _super);
    function PixiEdge() {
        var _this = _super.call(this) || this;
        _this.hovered = false;
        // todo(lin)
        //  later we need to support select state for edge
        _this.selected = false;
        _this.edgeGfx = _this.createEdge();
        _this.edgePlaceholderGfx = new Container();
        _this.edgeLabelGfx = _this.createEdgeLabel();
        _this.edgeLabelPlaceholderGfx = new Container();
        return _this;
    }
    PixiEdge.prototype.createEdge = function () {
        var _this = this;
        var edgeGfx = new Container();
        edgeGfx.interactive = true;
        edgeGfx.buttonMode = true;
        edgeGfx.on('mousemove', function (event) {
            return _this.emit('mousemove', event.data.originalEvent);
        });
        edgeGfx.on('mouseover', function (event) {
            return _this.emit('mouseover', event.data.originalEvent);
        });
        edgeGfx.on('mouseout', function (event) { return _this.emit('mouseout', event.data.originalEvent); });
        edgeGfx.on('mousedown', function (event) {
            return _this.emit('mousedown', event.data.originalEvent);
        });
        edgeGfx.on('mouseup', function (event) { return _this.emit('mouseup', event.data.originalEvent); });
        createEdge(edgeGfx);
        return edgeGfx;
    };
    PixiEdge.prototype.createEdgeLabel = function () {
        var edgeLabelGfx = new Container();
        createEdgeLabel(edgeLabelGfx);
        return edgeLabelGfx;
    };
    PixiEdge.prototype.updatePosition = function (sourceNodePosition, targetNodePosition, nodeStyle, edgeStyle, textureCache, isDirected, isSelfLoop, parallelEdgeCount, parallelSeq) {
        var position = {
            x: (sourceNodePosition.x + targetNodePosition.x) / 2,
            y: (sourceNodePosition.y + targetNodePosition.y) / 2,
        };
        var rotation = Math.atan2(targetNodePosition.y - sourceNodePosition.y, targetNodePosition.x - sourceNodePosition.x);
        this.edgeGfx.position.copyFrom(position);
        this.edgeGfx.rotation = rotation;
        var selfLoopHeight = undefined;
        if (isSelfLoop) {
            // we need to do calculate here to setup correct coordinates
            var nodeSize = nodeStyle.size;
            var _a = getLoopEdgeBezierPoint(nodeSize, parallelSeq, sourceNodePosition.x, sourceNodePosition.y), sx = _a.sx, sy = _a.sy, cp1x = _a.cp1x, cp1y = _a.cp1y, cp2x = _a.cp2x, cp2y = _a.cp2y, ex = _a.ex, ey = _a.ey;
            // const length = Math.hypot(sx - ex, sy - ey);
            var position_1 = {
                x: (sx + ex) / 2,
                y: (sy + ey) / 2,
            };
            var rotation_1 = Math.atan2(ey - sy, ex - sx);
            this.edgeLabelGfx.position.copyFrom(position_1);
            this.edgeLabelGfx.rotation = rotation_1;
            sourceNodePosition = {
                x: -length / 2,
                y: 0,
            };
            targetNodePosition = {
                x: length / 2,
                y: 0,
            };
            var center = getCubicBezierXY(0.5, sx, sy, cp1x, cp1y, cp2x, cp2y, ex, ey);
            // we calculate self loop height here and pass to edge label
            // note, we use position to calculate height
            selfLoopHeight = Math.hypot(center.x - position_1.x, center.y - position_1.y);
        }
        else {
            this.edgeLabelGfx.position.copyFrom(position);
            this.edgeLabelGfx.rotation = rotation;
        }
        updateEdgePosition(this.edgeGfx, sourceNodePosition, targetNodePosition, nodeStyle, edgeStyle, textureCache, isDirected, isSelfLoop, parallelEdgeCount, parallelSeq);
        updateLabelPosition(this.edgeLabelGfx, sourceNodePosition, targetNodePosition, nodeStyle, edgeStyle, textureCache, isDirected, isSelfLoop, parallelEdgeCount, parallelSeq, selfLoopHeight);
    };
    PixiEdge.prototype.updateStyle = function (edgeStyle, textureCache, isDirected, isSelfLoop, parallelEdgeCount, parallelSeq) {
        updateEdgeStyle(this.edgeGfx, edgeStyle, textureCache, isDirected, isSelfLoop, parallelEdgeCount, parallelSeq);
    };
    PixiEdge.prototype.updateVisibility = function (zoomStep, isSelfLoop, parallelEdgeCount, parallelSeq) {
        updateEdgeVisibility(this.edgeGfx, zoomStep, isSelfLoop, parallelEdgeCount, parallelSeq);
        updateEdgeLabelVisibility(this.edgeLabelGfx, zoomStep);
    };
    return PixiEdge;
}(TypedEmitter));

Application.registerPlugin(TickerPlugin);
Application.registerPlugin(AppLoaderPlugin);
Loader.registerPlugin(BitmapFontLoader);
Renderer.registerPlugin('batch', BatchRenderer);
Renderer.registerPlugin('interaction', InteractionManager);
var DEFAULT_STYLE = {
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
            fontFamily: 'Arial',
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
var WORLD_PADDING = 100;
var PixiGraph = /** @class */ (function (_super) {
    __extends(PixiGraph, _super);
    function PixiGraph(options) {
        var _this = _super.call(this) || this;
        _this.iterationNum = 0;
        _this.iterations = 0;
        _this.nodeKeyToNodeObject = new Map();
        _this.edgeKeyToEdgeObject = new Map();
        _this.selectNodeKeys = new Set();
        _this.parallelEdgeMap = new Map();
        _this.mousedownNodeKey = null;
        _this.mousedownEdgeKey = null;
        _this.mouseDownPosition = null;
        _this.onGraphNodeAddedBound = _this.onGraphNodeAdded.bind(_this);
        _this.onGraphEdgeAddedBound = _this.onGraphEdgeAdded.bind(_this);
        _this.onGraphNodeDroppedBound = _this.onGraphNodeDropped.bind(_this);
        _this.onGraphEdgeDroppedBound = _this.onGraphEdgeDropped.bind(_this);
        _this.onGraphClearedBound = _this.onGraphCleared.bind(_this);
        _this.onGraphEdgesClearedBound = _this.onGraphEdgesCleared.bind(_this);
        _this.onGraphNodeAttributesUpdatedBound = _this.onGraphNodeAttributesUpdated.bind(_this);
        _this.onGraphEdgeAttributesUpdatedBound = _this.onGraphEdgeAttributesUpdated.bind(_this);
        _this.onGraphEachNodeAttributesUpdatedBound = _this.onGraphEachNodeAttributesUpdated.bind(_this);
        _this.onGraphEachEdgeAttributesUpdatedBound = _this.onGraphEachEdgeAttributesUpdated.bind(_this);
        _this.onDocumentMouseMoveBound = _this.onDocumentMouseMove.bind(_this);
        _this.onDocumentMouseUpBound = _this.onDocumentMouseUp.bind(_this);
        _this.container = options.container;
        _this.graph = options.graph;
        _this.layoutConfig = options.layout;
        _this.style = options.style;
        _this.hoverStyle = options.hoverStyle;
        _this.selectStyle = options.selectStyle;
        _this.resources = options.resources;
        // do layout
        _this.createLayout();
        _this.doLayout();
        if (!(_this.container instanceof HTMLElement)) {
            throw new Error('container should be a HTMLElement');
        }
        settings.LINE_SCALE_MODE = LINE_SCALE_MODE.NORMAL;
        // create PIXI application
        _this.app = new Application({
            resizeTo: _this.container,
            resolution: window.devicePixelRatio,
            transparent: true,
            antialias: true,
            autoDensity: true,
        });
        _this.container.appendChild(_this.app.view);
        // this.cull = new Simple({
        //   dirtyTest: true,
        // });
        _this.app.renderer.plugins.interaction.moveWhenInside = true;
        _this.app.view.addEventListener('wheel', function (event) {
            event.preventDefault();
        });
        _this.textureCache = new TextureCache(_this.app.renderer);
        // create PIXI viewport
        _this.viewport = new Viewport({
            screenWidth: _this.container.clientWidth,
            screenHeight: _this.container.clientHeight,
            interaction: _this.app.renderer.plugins.interaction,
        })
            .drag()
            .pinch()
            .wheel()
            .decelerate()
            .clampZoom({ maxScale: 5 });
        _this.app.stage.addChild(_this.viewport);
        _this.viewport.on('mousedown', function (event) {
            if (event.target === _this.viewport) {
                var mouseEvent = event.data.originalEvent;
                _this.mouseDownPosition = {
                    x: mouseEvent.clientX,
                    y: mouseEvent.clientY,
                };
            }
        });
        _this.viewport.on('mouseup', function (event) {
            if (event.target === _this.viewport && _this.mouseDownPosition) {
                var mouseEvent = event.data.originalEvent;
                var diff = Math.sqrt(Math.abs(mouseEvent.clientX - _this.mouseDownPosition.x)) +
                    Math.sqrt(Math.abs(mouseEvent.clientY - _this.mouseDownPosition.y));
                if (diff <= 2) {
                    _this.selectNodeKeys.forEach(function (nodeKey) {
                        _this.unselectNode(nodeKey);
                    });
                    _this.selectNodeKeys.clear();
                }
                _this.mouseDownPosition = null;
            }
        });
        _this.viewport.on('rightup', function (event) {
            if (event.target === _this.viewport) {
                var mouseEvent = event.data.originalEvent;
                _this.emit('rightClick', mouseEvent);
            }
        });
        // create layers
        _this.edgeLayer = new Container();
        _this.edgeLabelLayer = new Container();
        _this.frontEdgeLayer = new Container();
        _this.frontEdgeLabelLayer = new Container();
        _this.nodeLayer = new Container();
        _this.nodeLabelLayer = new Container();
        _this.frontNodeLayer = new Container();
        _this.frontNodeLabelLayer = new Container();
        _this.viewport.addChild(_this.edgeLayer);
        _this.viewport.addChild(_this.edgeLabelLayer);
        _this.viewport.addChild(_this.frontEdgeLayer);
        _this.viewport.addChild(_this.frontEdgeLabelLayer);
        _this.viewport.addChild(_this.nodeLayer);
        _this.viewport.addChild(_this.nodeLabelLayer);
        _this.viewport.addChild(_this.frontNodeLayer);
        _this.viewport.addChild(_this.frontNodeLabelLayer);
        _this.resizeObserver = new ResizeObserver(function () {
            _this.app.resize();
            _this.viewport.resize(_this.container.clientWidth, _this.container.clientHeight);
            _this.updateGraphVisibility();
        });
        // preload resources
        if (_this.resources) {
            _this.app.loader.add(_this.resources);
        }
        _this.app.loader.load(function () {
            _this.viewport.on('frame-end', function () {
                if (_this.viewport.dirty) {
                    _this.updateGraphVisibility();
                    _this.viewport.dirty = false;
                }
            });
            _this.resizeObserver.observe(_this.container);
            // need to calculate parallel edge before register event listener
            _this.calculateParallelEdge();
            // listen to graph changes
            _this.graph.on('nodeAdded', _this.onGraphNodeAddedBound);
            _this.graph.on('edgeAdded', _this.onGraphEdgeAddedBound);
            _this.graph.on('nodeDropped', _this.onGraphNodeDroppedBound);
            _this.graph.on('edgeDropped', _this.onGraphEdgeDroppedBound);
            _this.graph.on('cleared', _this.onGraphClearedBound);
            _this.graph.on('edgesCleared', _this.onGraphEdgesClearedBound);
            _this.graph.on('nodeAttributesUpdated', _this.onGraphNodeAttributesUpdatedBound);
            _this.graph.on('edgeAttributesUpdated', _this.onGraphEdgeAttributesUpdatedBound);
            _this.graph.on('eachNodeAttributesUpdated', _this.onGraphEachNodeAttributesUpdatedBound);
            _this.graph.on('eachEdgeAttributesUpdated', _this.onGraphEachEdgeAttributesUpdatedBound);
            // init draw
            _this.createGraph();
            _this.resetView();
        });
        return _this;
    }
    PixiGraph.prototype.destroy = function () {
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
        this.resizeObserver = undefined;
        this.textureCache.destroy();
        this.textureCache = undefined;
        this.app.destroy(true, { children: true, texture: true, baseTexture: true });
        this.app = undefined;
    };
    PixiGraph.prototype.createLayout = function () {
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
                throw new Error("unsupported layout: " + this.layoutConfig.type);
        }
    };
    PixiGraph.prototype.updateLayout = function (layoutConfig) {
        this.layoutConfig = layoutConfig;
        // create layout object if needed
        if (this.layoutConfig.type !== layoutConfig.type) {
            this.createLayout();
        }
        // do layout based on new config
        this.doLayout();
    };
    PixiGraph.prototype.isForceLayout = function () {
        return this.layoutConfig.type === 'forceatlas2';
    };
    PixiGraph.prototype.doForceLayout = function () {
        console.time(this.layoutConfig.type);
        if (this.layoutConfig.type === 'forceatlas2') {
            // need to wait web worker layout failed
            this.iterationNum = 0;
            this.forceAtlas2Layout.runLayout(this.graph);
        }
    };
    PixiGraph.prototype.doLayout = function () {
        if (this.isForceLayout()) {
            this.doForceLayout();
            return;
        }
        console.time(this.layoutConfig.type);
        var nodes = [];
        var edges = [];
        this.graph.forEachNode(function (nodeKey) {
            return nodes.push({
                id: nodeKey,
            });
        });
        this.graph.forEachEdge(function (_edgeKey, _edgeAttributes, sourceNodeKey, targetNodeKey) {
            edges.push({
                source: sourceNodeKey,
                target: targetNodeKey,
            });
        });
        var layoutResult = this.layout.layout({
            nodes: nodes,
            edges: edges,
        });
        var positionedNodes = layoutResult.nodes;
        for (var _i = 0, positionedNodes_1 = positionedNodes; _i < positionedNodes_1.length; _i++) {
            var node = positionedNodes_1[_i];
            this.graph.setNodeAttribute(node.id, 'x', node.x);
            this.graph.setNodeAttribute(node.id, 'y', node.y);
        }
        console.timeEnd(this.layoutConfig.type);
    };
    Object.defineProperty(PixiGraph.prototype, "zoomStep", {
        get: function () {
            return Math.min(this.viewport.worldWidth, this.viewport.worldHeight) / 10;
        },
        enumerable: false,
        configurable: true
    });
    PixiGraph.prototype.zoomIn = function () {
        this.viewport.zoom(-this.zoomStep, true);
    };
    PixiGraph.prototype.zoomOut = function () {
        this.viewport.zoom(this.zoomStep, true);
    };
    PixiGraph.prototype.resetView = function () {
        var _this = this;
        var nodesX = this.graph.nodes().map(function (nodeKey) { return _this.graph.getNodeAttribute(nodeKey, 'x'); });
        var nodesY = this.graph.nodes().map(function (nodeKey) { return _this.graph.getNodeAttribute(nodeKey, 'y'); });
        var minX = Math.min.apply(Math, nodesX);
        var maxX = Math.max.apply(Math, nodesX);
        var minY = Math.min.apply(Math, nodesY);
        var maxY = Math.max.apply(Math, nodesY);
        var graphWidth = Math.abs(maxX - minX);
        var graphHeight = Math.abs(maxY - minY);
        var graphCenter = new Point(minX + graphWidth / 2, minY + graphHeight / 2);
        var worldWidth = graphWidth + WORLD_PADDING * 2;
        var worldHeight = graphHeight + WORLD_PADDING * 2;
        // TODO: update worldWidth/worldHeight when graph is updated?
        this.viewport.resize(this.container.clientWidth, this.container.clientHeight, worldWidth, worldHeight);
        this.viewport.setZoom(1); // otherwise scale is 0 when initialized in React useEffect
        this.viewport.center = graphCenter;
        this.viewport.fit(true);
    };
    PixiGraph.prototype.calculateParallelEdge = function () {
        var _this = this;
        var parallelEdgeMap = new Map();
        this.graph.forEachEdge(function (edgeKey, _edgeAttributes, sourceNodeKey, targetNodeKey) {
            var key = sourceNodeKey + "_" + targetNodeKey;
            var count = (parallelEdgeMap.get(key) || 0) + 1;
            parallelEdgeMap.set(key, count);
            _this.graph.setEdgeAttribute(edgeKey, 'parallelSeq', count);
        });
        this.parallelEdgeMap = parallelEdgeMap;
    };
    PixiGraph.prototype.onGraphNodeAdded = function (data) {
        this.calculateParallelEdge();
        var nodeKey = data.key;
        var nodeAttributes = data.attributes;
        this.createNode(nodeKey, nodeAttributes);
    };
    PixiGraph.prototype.onGraphEdgeAdded = function (data) {
        this.calculateParallelEdge();
        var edgeKey = data.key;
        var edgeAttributes = data.attributes;
        var sourceNodeKey = data.source;
        var targetNodeKey = data.target;
        var sourceNodeAttributes = this.graph.getNodeAttributes(sourceNodeKey);
        var targetNodeAttributes = this.graph.getNodeAttributes(targetNodeKey);
        this.createEdge(edgeKey, edgeAttributes, sourceNodeKey, targetNodeKey, sourceNodeAttributes, targetNodeAttributes);
    };
    PixiGraph.prototype.onGraphNodeDropped = function (data) {
        this.calculateParallelEdge();
        var nodeKey = data.key;
        this.dropNode(nodeKey);
    };
    PixiGraph.prototype.onGraphEdgeDropped = function (data) {
        this.calculateParallelEdge();
        var edgeKey = data.key;
        this.dropEdge(edgeKey);
    };
    PixiGraph.prototype.onGraphCleared = function () {
        Array.from(this.edgeKeyToEdgeObject.keys()).forEach(this.dropEdge.bind(this));
        Array.from(this.nodeKeyToNodeObject.keys()).forEach(this.dropNode.bind(this));
    };
    PixiGraph.prototype.onGraphEdgesCleared = function () {
        Array.from(this.edgeKeyToEdgeObject.keys()).forEach(this.dropEdge.bind(this));
    };
    PixiGraph.prototype.onGraphNodeAttributesUpdated = function (data) {
        var nodeKey = data.key;
        this.updateNodeStyleByKey(nodeKey);
        // TODO: normalize position?
    };
    PixiGraph.prototype.onGraphEdgeAttributesUpdated = function (data) {
        var edgeKey = data.key;
        this.updateEdgeStyleByKey(edgeKey);
    };
    PixiGraph.prototype.onGraphEachNodeAttributesUpdated = function () {
        var _this = this;
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
        this.graph.forEachNode(function (nodeKey, nodeAttributes) {
            // console.log(nodeKey, nodeAttributes.x, nodeAttributes.y);
            var node = _this.nodeKeyToNodeObject.get(nodeKey);
            node.updatePosition({
                x: nodeAttributes.x,
                y: nodeAttributes.y,
            });
        });
        this.graph.forEachNode(this.updateNodeStyle.bind(this));
        this.graph.forEachEdge(this.updateEdgeStyle.bind(this));
    };
    PixiGraph.prototype.onGraphEachEdgeAttributesUpdated = function () {
        this.graph.forEachEdge(this.updateEdgeStyle.bind(this));
    };
    PixiGraph.prototype.setNodeStatus = function (nodeKey, status) {
        var node = this.nodeKeyToNodeObject.get(nodeKey);
        // selected > hovered
        if (status === 'hovered' && !node.selected) {
            if (node.hovered) {
                return;
            }
            // update style
            node.hovered = true;
        }
        else if (status === 'selected') {
            if (node.selected) {
                return;
            }
            node.selected = true;
        }
        this.updateNodeStyleByKey(nodeKey);
        // move to front
        var nodeIndex = this.nodeLayer.children.indexOf(node.nodeGfx);
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
    };
    PixiGraph.prototype.unsetNodeStatus = function (nodeKey, status) {
        var node = this.nodeKeyToNodeObject.get(nodeKey);
        if (status === 'hovered' && !node.selected) {
            if (!node.hovered) {
                return;
            }
            // update style
            node.hovered = false;
        }
        else if (status === 'selected') {
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
            var nodeIndex = this.frontNodeLayer.getChildIndex(node.nodeGfx);
            this.nodeLayer.removeChildAt(nodeIndex);
            this.nodeLabelLayer.removeChildAt(nodeIndex);
            this.frontNodeLayer.removeChildAt(nodeIndex);
            this.frontNodeLabelLayer.removeChildAt(nodeIndex);
            this.nodeLayer.addChild(node.nodeGfx);
            this.nodeLabelLayer.addChild(node.nodeLabelGfx);
            this.frontNodeLayer.addChild(node.nodePlaceholderGfx);
            this.frontNodeLabelLayer.addChild(node.nodeLabelPlaceholderGfx);
        }
    };
    PixiGraph.prototype.selectNode = function (nodeKey) {
        this.setNodeStatus(nodeKey, 'selected');
    };
    PixiGraph.prototype.unselectNode = function (nodeKey) {
        this.unsetNodeStatus(nodeKey, 'selected');
    };
    PixiGraph.prototype.hoverNode = function (nodeKey) {
        this.setNodeStatus(nodeKey, 'hovered');
    };
    PixiGraph.prototype.unhoverNode = function (nodeKey) {
        this.unsetNodeStatus(nodeKey, 'hovered');
    };
    PixiGraph.prototype.hoverEdge = function (edgeKey) {
        var edge = this.edgeKeyToEdgeObject.get(edgeKey);
        if (edge.hovered) {
            return;
        }
        // update style
        edge.hovered = true;
        this.updateEdgeStyleByKey(edgeKey);
        // move to front
        var edgeIndex = this.edgeLayer.getChildIndex(edge.edgeGfx);
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
    };
    PixiGraph.prototype.unhoverEdge = function (edgeKey) {
        var edge = this.edgeKeyToEdgeObject.get(edgeKey);
        if (!edge.hovered) {
            return;
        }
        // update style
        edge.hovered = false;
        this.updateEdgeStyleByKey(edgeKey);
        // move back
        var edgeIndex = this.frontEdgeLayer.getChildIndex(edge.edgeGfx);
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
    };
    PixiGraph.prototype.moveNode = function (nodeKey, point) {
        this.graph.setNodeAttribute(nodeKey, 'x', point.x);
        this.graph.setNodeAttribute(nodeKey, 'y', point.y);
        var node = this.nodeKeyToNodeObject.get(nodeKey);
        var nodePosition = { x: point.x, y: point.y };
        node.updatePosition(nodePosition);
        // update style
        this.updateNodeStyleByKey(nodeKey);
        this.graph.edges(nodeKey).forEach(this.updateEdgeStyleByKey.bind(this));
    };
    PixiGraph.prototype.moveNodebyDelta = function (nodeKey, deltaX, deltaY) {
        var x = this.graph.getNodeAttribute(nodeKey, 'x');
        var y = this.graph.getNodeAttribute(nodeKey, 'y');
        this.graph.setNodeAttribute(nodeKey, 'x', x + deltaX);
        this.graph.setNodeAttribute(nodeKey, 'y', y + deltaY);
        var node = this.nodeKeyToNodeObject.get(nodeKey);
        var nodePosition = { x: x + deltaX, y: y + deltaY };
        node.updatePosition(nodePosition);
        // update style
        this.updateNodeStyleByKey(nodeKey);
        this.graph.edges(nodeKey).forEach(this.updateEdgeStyleByKey.bind(this));
    };
    PixiGraph.prototype.enableNodeDragging = function () {
        this.viewport.pause = true; // disable viewport dragging
        document.addEventListener('mousemove', this.onDocumentMouseMoveBound);
        document.addEventListener('mouseup', this.onDocumentMouseUpBound, { once: true });
    };
    PixiGraph.prototype.onDocumentMouseMove = function (event) {
        var _this = this;
        var eventPosition = new Point(event.offsetX, event.offsetY);
        var worldPosition = this.viewport.toWorld(eventPosition);
        if (this.mousedownNodeKey) {
            if (this.selectNodeKeys.has(this.mousedownNodeKey)) {
                var prevX = this.graph.getNodeAttribute(this.mousedownNodeKey, 'x');
                var preY = this.graph.getNodeAttribute(this.mousedownNodeKey, 'y');
                var deltaX_1 = worldPosition.x - prevX;
                var deltaY_1 = worldPosition.y - preY;
                this.selectNodeKeys.forEach(function (nodeKey) { return _this.moveNodebyDelta(nodeKey, deltaX_1, deltaY_1); });
            }
            else {
                this.moveNode(this.mousedownNodeKey, worldPosition);
            }
        }
    };
    PixiGraph.prototype.onDocumentMouseUp = function () {
        this.viewport.pause = false; // enable viewport dragging
        document.removeEventListener('mousemove', this.onDocumentMouseMoveBound);
        this.mousedownNodeKey = null;
        this.mousedownEdgeKey = null;
    };
    PixiGraph.prototype.createGraph = function () {
        this.graph.forEachNode(this.createNode.bind(this));
        this.graph.forEachEdge(this.createEdge.bind(this));
        // todo
        // when graph change(position change or add/delete new node)
        // should mark related object dirty.
        // @ts-ignore
        // (this.viewport.children as Container[]).map((layer) => this.cull.addList(layer.children));
    };
    PixiGraph.prototype.createNode = function (nodeKey, nodeAttributes) {
        var _this = this;
        var node = new PixiNode();
        node.on('mousemove', function (event) {
            _this.emit('nodeMousemove', event, nodeKey);
        });
        node.on('mouseover', function (event) {
            if (!_this.mousedownNodeKey) {
                _this.hoverNode(nodeKey);
            }
            _this.emit('nodeMouseover', event, nodeKey, node.nodeGfx.getBounds());
        });
        node.on('mouseout', function (event) {
            if (!_this.mousedownNodeKey) {
                _this.unhoverNode(nodeKey);
            }
            _this.emit('nodeMouseout', event, nodeKey);
        });
        node.on('mousedown', function (event) {
            _this.mousedownNodeKey = nodeKey;
            _this.enableNodeDragging();
            _this.emit('nodeMousedown', event, nodeKey);
            _this.mouseDownPosition = {
                x: event.clientX,
                y: event.clientY,
            };
        });
        node.on('rightdown', function (_event) {
            _this.mousedownNodeKey = nodeKey;
        });
        node.on('rightup', function (event) {
            if (_this.mousedownNodeKey === nodeKey) {
                _this.emit('nodeRightClick', event, nodeKey);
            }
            _this.mousedownNodeKey = null;
        });
        var doubleClickDelayMs = 350;
        var previousTapStamp = 0;
        node.on('mouseup', function (event) {
            _this.emit('nodeMouseup', event, nodeKey);
            // why native click event doesn't work?
            if (_this.mousedownNodeKey === nodeKey && _this.mouseDownPosition) {
                var diff = Math.sqrt(Math.abs(event.clientX - _this.mouseDownPosition.x)) +
                    Math.sqrt(Math.abs(event.clientY - _this.mouseDownPosition.y));
                if (diff <= 2) {
                    if (event.metaKey || event.ctrlKey || event.shiftKey) {
                        _this.selectNodeKeys.add(nodeKey);
                        _this.selectNode(nodeKey);
                    }
                    else {
                        _this.selectNodeKeys.forEach(function (nodeKey) {
                            _this.unselectNode(nodeKey);
                        });
                        _this.selectNodeKeys.clear();
                        _this.selectNodeKeys.add(nodeKey);
                        _this.selectNode(nodeKey);
                    }
                    _this.emit('nodeClick', event, nodeKey);
                    // check for double click
                    if (event.shiftKey || event.ctrlKey || event.metaKey) {
                        return;
                    }
                    var currentTapStamp = event.timeStamp;
                    var msFromLastTap = currentTapStamp - previousTapStamp;
                    previousTapStamp = currentTapStamp;
                    if (msFromLastTap < doubleClickDelayMs) {
                        _this.emit('nodeDoubleClick', event, nodeKey);
                        return;
                    }
                }
            }
            _this.mousedownNodeKey = null;
        });
        this.nodeLayer.addChild(node.nodeGfx);
        this.nodeLabelLayer.addChild(node.nodeLabelGfx);
        this.frontNodeLayer.addChild(node.nodePlaceholderGfx);
        this.frontNodeLabelLayer.addChild(node.nodeLabelPlaceholderGfx);
        this.nodeKeyToNodeObject.set(nodeKey, node);
        var nodePosition = { x: nodeAttributes.x, y: nodeAttributes.y };
        node.updatePosition(nodePosition);
        this.updateNodeStyle(nodeKey, nodeAttributes);
    };
    PixiGraph.prototype.createEdge = function (edgeKey, edgeAttributes, sourceNodeKey, targetNodeKey, sourceNodeAttributes, targetNodeAttributes) {
        var _this = this;
        var edge = new PixiEdge();
        edge.on('mousemove', function (event) {
            _this.emit('edgeMousemove', event, edgeKey);
        });
        edge.on('mouseover', function (event) {
            _this.hoverEdge(edgeKey);
            _this.emit('edgeMouseover', event, edgeKey);
        });
        edge.on('mouseout', function (event) {
            _this.unhoverEdge(edgeKey);
            _this.emit('edgeMouseout', event, edgeKey);
        });
        edge.on('mousedown', function (event) {
            _this.mousedownEdgeKey = edgeKey;
            _this.emit('edgeMousedown', event, edgeKey);
        });
        edge.on('mouseup', function (event) {
            _this.emit('edgeMouseup', event, edgeKey);
            // why native click event doesn't work?
            if (_this.mousedownEdgeKey === edgeKey) {
                _this.emit('edgeClick', event, edgeKey);
            }
        });
        this.edgeLayer.addChild(edge.edgeGfx);
        this.edgeLabelLayer.addChild(edge.edgeLabelGfx);
        this.frontEdgeLayer.addChild(edge.edgePlaceholderGfx);
        this.frontEdgeLabelLayer.addChild(edge.edgeLabelPlaceholderGfx);
        this.edgeKeyToEdgeObject.set(edgeKey, edge);
        this.updateEdgeStyle(edgeKey, edgeAttributes, sourceNodeKey, targetNodeKey, sourceNodeAttributes, targetNodeAttributes);
    };
    PixiGraph.prototype.dropNode = function (nodeKey) {
        var node = this.nodeKeyToNodeObject.get(nodeKey);
        this.nodeLayer.removeChild(node.nodeGfx);
        this.nodeLabelLayer.removeChild(node.nodeLabelGfx);
        this.frontNodeLayer.removeChild(node.nodePlaceholderGfx);
        this.frontNodeLabelLayer.removeChild(node.nodeLabelPlaceholderGfx);
        this.nodeKeyToNodeObject.delete(nodeKey);
    };
    PixiGraph.prototype.dropEdge = function (edgeKey) {
        var edge = this.edgeKeyToEdgeObject.get(edgeKey);
        this.edgeLayer.removeChild(edge.edgeGfx);
        this.edgeLabelLayer.removeChild(edge.edgeLabelGfx);
        this.frontEdgeLayer.removeChild(edge.edgePlaceholderGfx);
        this.frontEdgeLabelLayer.removeChild(edge.edgeLabelPlaceholderGfx);
        this.edgeKeyToEdgeObject.delete(edgeKey);
    };
    PixiGraph.prototype.updateNodeStyleByKey = function (nodeKey) {
        var nodeAttributes = this.graph.getNodeAttributes(nodeKey);
        this.updateNodeStyle(nodeKey, nodeAttributes);
    };
    PixiGraph.prototype.updateNodeStyle = function (nodeKey, nodeAttributes) {
        var node = this.nodeKeyToNodeObject.get(nodeKey);
        var stateStyle = undefined;
        if (node.selected) {
            stateStyle = this.selectStyle.node;
        }
        else if (node.hovered) {
            stateStyle = this.hoverStyle.node;
        }
        var nodeStyleDefinitions = [DEFAULT_STYLE.node, this.style.node, stateStyle];
        var nodeStyle = resolveStyleDefinitions(nodeStyleDefinitions, nodeAttributes);
        node.updateStyle(nodeStyle, this.textureCache);
    };
    PixiGraph.prototype.updateEdgeStyleByKey = function (edgeKey) {
        var edgeAttributes = this.graph.getEdgeAttributes(edgeKey);
        var sourceNodeKey = this.graph.source(edgeKey);
        var targetNodeKey = this.graph.target(edgeKey);
        var sourceNodeAttributes = this.graph.getNodeAttributes(sourceNodeKey);
        var targetNodeAttributes = this.graph.getNodeAttributes(targetNodeKey);
        this.updateEdgeStyle(edgeKey, edgeAttributes, sourceNodeKey, targetNodeKey, sourceNodeAttributes, targetNodeAttributes);
    };
    PixiGraph.prototype.updateEdgeStyle = function (edgeKey, edgeAttributes, sourceNodeKey, targetNodeKey, _sourceNodeAttributes, targetNodeAttributes) {
        var key = sourceNodeKey + "_" + targetNodeKey;
        var parallelEdgeCount = this.parallelEdgeMap.get(key) || 1;
        var parallelSeq = this.graph.getEdgeAttribute(edgeKey, 'parallelSeq');
        var isDirected = this.graph.isDirected(edgeKey);
        var edge = this.edgeKeyToEdgeObject.get(edgeKey);
        var sourceNode = this.nodeKeyToNodeObject.get(sourceNodeKey);
        var targetNode = this.nodeKeyToNodeObject.get(targetNodeKey);
        var sourceNodePosition = { x: sourceNode.nodeGfx.position.x, y: sourceNode.nodeGfx.position.y };
        var targetNodePosition = { x: targetNode.nodeGfx.position.x, y: targetNode.nodeGfx.position.y };
        var nodeStyleDefinitions = [DEFAULT_STYLE.node, this.style.node];
        var nodeStyle = resolveStyleDefinitions(nodeStyleDefinitions, targetNodeAttributes);
        var edgeStyleDefinitions = [DEFAULT_STYLE.edge, this.style.edge, edge.hovered ? this.hoverStyle.edge : undefined];
        var edgeStyle = resolveStyleDefinitions(edgeStyleDefinitions, edgeAttributes);
        edge.updatePosition(sourceNodePosition, targetNodePosition, nodeStyle, edgeStyle, this.textureCache, isDirected, sourceNodeKey === targetNodeKey, parallelEdgeCount, parallelSeq);
        edge.updateStyle(edgeStyle, this.textureCache, isDirected, sourceNodeKey === targetNodeKey, parallelEdgeCount, parallelSeq);
    };
    PixiGraph.prototype.updateGraphVisibility = function () {
        // culling todo(rotation cull have bug)
        // https://github.com/davidfig/pixi-cull/issues/2
        // this.cull.cull(this.viewport.getVisibleBounds(), false);
        // should refer https://github.com/ShukantPal/pixi-essentials/tree/master/packages/cull
        var _this = this;
        // original culling have performance issue.
        var cull = new Cull();
        cull.addAll(this.viewport.children.map(function (layer) { return layer.children; }).flat());
        cull.cull(this.app.renderer.screen);
        // console.log(
        //   Array.from((cull as any)._targetList as Set<DisplayObject>).filter(x => x.visible === true).length,
        //   Array.from((cull as any)._targetList as Set<DisplayObject>).filter(x => x.visible === false).length
        // );
        // levels of detail
        var zoom = this.viewport.scale.x;
        var zoomSteps = [0.1, 0.2, 0.4, Infinity];
        var zoomStep = zoomSteps.findIndex(function (zoomStep) { return zoom <= zoomStep; });
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
        this.graph.forEachNode(function (nodeKey) {
            var node = _this.nodeKeyToNodeObject.get(nodeKey);
            node.updateVisibility(zoomStep);
        });
        this.graph.forEachEdge(function (edgeKey, _edgeAttributes, sourceNodeKey, targetNodeKey) {
            var key = sourceNodeKey + "_" + targetNodeKey;
            var parallelEdgeCount = _this.parallelEdgeMap.get(key) || 0;
            var parallelSeq = _this.graph.getEdgeAttribute(edgeKey, 'parallelSeq');
            var edge = _this.edgeKeyToEdgeObject.get(edgeKey);
            edge.updateVisibility(zoomStep, sourceNodeKey === targetNodeKey, parallelEdgeCount, parallelSeq);
        });
    };
    return PixiGraph;
}(TypedEmitter));

export { PixiGraph, TextType };
//# sourceMappingURL=pixi-graph.esm.js.map
