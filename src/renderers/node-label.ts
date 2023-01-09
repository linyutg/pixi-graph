import { Container } from '@pixi/display';
import { Sprite } from '@pixi/sprite';
import { BitmapText } from '@pixi/text-bitmap';
import '@pixi/mixin-get-child-by-name';
import { colorToPixi } from '../utils/color';
import { NodeStyle } from '../utils/style';
import { textToPixi } from '../utils/text';
import { TextureCache } from '../texture-cache';

const DELIMETER = '::';

const NODE_LABEL_TEXT = 'NODE_LABEL_TEXT';

export function createNodeLabel(nodeLabelGfx: Container) {
  // nodeLabelGfx -> nodeLabelText
  const nodeLabelText = new Sprite();
  nodeLabelText.name = NODE_LABEL_TEXT;
  nodeLabelText.anchor.set(0.5);
  nodeLabelGfx.addChild(nodeLabelText);
}

export function updateNodeLabelStyle(nodeLabelGfx: Container, nodeStyle: NodeStyle, textureCache: TextureCache) {
  const nodeLabelTextTextureKey = [
    NODE_LABEL_TEXT,
    nodeStyle.label.fontFamily,
    nodeStyle.label.fontSize,
    nodeStyle.label.content,
  ].join(DELIMETER);
  const nodeLabelTextTexture = textureCache.get(nodeLabelTextTextureKey, () => {
    const text = textToPixi(nodeStyle.label.type, nodeStyle.label.content, {
      fontFamily: nodeStyle.label.fontFamily,
      fontSize: nodeStyle.label.fontSize,
    });
    return text;
  });

  // nodeLabelGfx -> nodeLabelText
  const nodeLabelText = nodeLabelGfx.getChildByName!(NODE_LABEL_TEXT) as unknown as Sprite;
  nodeLabelText.texture = nodeLabelTextTexture;
  nodeLabelText.y = nodeStyle.size + (nodeLabelTextTexture.height + nodeStyle.label.padding * 2) / 2;
  [nodeLabelText.tint, nodeLabelText.alpha] = colorToPixi(nodeStyle.label.color);
}

export function updateNodeLabelVisibility(nodeLabelGfx: Container, zoomStep: number) {
  // nodeLabelGfx -> nodeLabelText
  const nodeLabelText = nodeLabelGfx.getChildByName!(NODE_LABEL_TEXT) as unknown as BitmapText;
  nodeLabelText.visible = zoomStep >= 3;
}
