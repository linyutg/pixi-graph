import { Texture } from '@pixi/core';
import { Container } from '@pixi/display';
import { Circle } from '@pixi/math';
import { Sprite } from '@pixi/sprite';
import { SmoothGraphics as Graphics } from '@pixi/graphics-smooth';
import '@pixi/mixin-get-child-by-name';
import { colorToPixi } from '../utils/color';
import { NodeStyle } from '../utils/style';
import { TextureCache } from '../texture-cache';

const DELIMETER = '::';
const WHITE = 0xffffff;

const NODE_CIRCLE = 'NODE_CIRCLE';
const NODE_CIRCLE_BORDER = 'NODE_CIRCLE_BORDER';
const NODE_ICON = 'NODE_ICON';

export function createNode(nodeGfx: Container) {
  // nodeGfx
  nodeGfx.hitArea = new Circle(0, 0);

  // nodeGfx -> nodeCircle
  const nodeCircle = new Sprite();
  nodeCircle.name = NODE_CIRCLE;
  nodeCircle.anchor.set(0.5);
  nodeGfx.addChild(nodeCircle);

  // nodeGfx -> nodeCircleBorder
  const nodeCircleBorder = new Sprite();
  nodeCircleBorder.name = NODE_CIRCLE_BORDER;
  nodeCircleBorder.anchor.set(0.5);
  nodeGfx.addChild(nodeCircleBorder);

  // nodeGfx -> nodeIcon
  const nodeIcon = new Sprite();
  nodeIcon.name = NODE_ICON;
  nodeIcon.anchor.set(0.5);
  nodeGfx.addChild(nodeIcon);
}

export function updateNodeStyle(nodeGfx: Container, nodeStyle: NodeStyle, textureCache: TextureCache) {
  const nodeOuterSize = nodeStyle.size + nodeStyle.border.width;

  const nodeCircleTextureKey = [NODE_CIRCLE, nodeStyle.size].join(DELIMETER);
  const nodeCircleTexture = textureCache.get(nodeCircleTextureKey, () => {
    const graphics = new Graphics();
    graphics.beginFill(WHITE, 1.0, true);
    graphics.drawCircle(nodeStyle.size, nodeStyle.size, nodeStyle.size);
    return graphics;
  });

  const nodeCircleBorderTextureKey = [NODE_CIRCLE_BORDER, nodeStyle.size, nodeStyle.border.width].join(DELIMETER);
  const nodeCircleBorderTexture = textureCache.get(nodeCircleBorderTextureKey, () => {
    const graphics = new Graphics();
    graphics.lineStyle(nodeStyle.border.width, WHITE);
    graphics.drawCircle(nodeOuterSize, nodeOuterSize, nodeStyle.size);
    return graphics;
  });

  // nodeGfx
  (nodeGfx.hitArea as Circle).radius = nodeOuterSize;

  // nodeGfx -> nodeCircle
  const nodeCircle = nodeGfx.getChildByName!(NODE_CIRCLE) as unknown as Sprite;
  nodeCircle.texture = nodeCircleTexture;
  [nodeCircle.tint, nodeCircle.alpha] = colorToPixi(nodeStyle.color);

  // nodeGfx -> nodeCircleBorder
  const nodeCircleBorder = nodeGfx.getChildByName!(NODE_CIRCLE_BORDER) as unknown as Sprite;
  nodeCircleBorder.texture = nodeCircleBorderTexture;
  [nodeCircleBorder.tint, nodeCircleBorder.alpha] = colorToPixi(nodeStyle.border.color);

  // nodeGfx -> nodeIcon
  if (nodeStyle.icon.url && nodeStyle.icon.width && nodeStyle.icon.height) {
    const nodeIcon = nodeGfx.getChildByName!(NODE_ICON) as unknown as Sprite;
    nodeIcon.texture = Texture.from(nodeStyle.icon.url);
    nodeIcon.width = nodeStyle.icon.width;
    nodeIcon.height = nodeStyle.icon.height;
    nodeGfx.addChild(nodeIcon);
  }
}

export function updateNodeVisibility(nodeGfx: Container, zoomStep: number) {
  // nodeGfx -> nodeCircleBorder
  const nodeCircleBorder = nodeGfx.getChildByName!(NODE_CIRCLE_BORDER) as unknown as Sprite;
  nodeCircleBorder.visible = zoomStep >= 1;

  // nodeGfx -> nodeIcon
  const nodeIcon = nodeGfx.getChildByName!(NODE_ICON) as unknown as Sprite;
  if (nodeIcon) {
    nodeIcon.visible = zoomStep >= 2;
  }
}
