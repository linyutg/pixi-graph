// the ForceAtlas2Layout from @antv/layout is slow
// and the quality is not good as https://graphology.github.io/standard-library/layout-forceatlas2.html

import Graph from 'graphology-types';
import { ForceAtlas2Settings } from 'graphology-layout-forceatlas2';
import FA2Layout from 'graphology-layout-forceatlas2/worker';
import { inferSettings } from 'graphology-layout-forceatlas2';

export type ForceAtlas2LayoutOptions = ForceAtlas2Settings & {
  type: 'forceatlas2';
  iterations: number;
};

export class ForceAtlas2Layout {
  options: ForceAtlas2LayoutOptions;
  layout?: FA2Layout;

  constructor(options: ForceAtlas2LayoutOptions) {
    this.options = options;
  }

  public runLayout(graph: Graph) {
    const layout = new FA2Layout(graph, {
      settings: {
        ...inferSettings(graph),
        ...this.options,
      },
    });

    // To start the layout
    layout.start();

    this.layout = layout;
  }

  public stopLayout() {
    this.layout?.stop();
  }

  public isRunning() {
    return this.layout?.isRunning();
  }

  public kill() {
    this.layout?.kill();
  }
}
