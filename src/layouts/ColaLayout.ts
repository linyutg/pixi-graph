import Graph from 'graphology-types';

export type ColaLayoutOptions = {
  type: 'cola';
};

export class ColaLayout {
  options: ColaLayoutOptions;

  constructor(options: ColaLayoutOptions) {
    this.options = options;
  }

  public runLayout(_graph: Graph) {}
}
