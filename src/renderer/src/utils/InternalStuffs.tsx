import { Component } from '../engine/Component'
import { generateRandomDesign } from '../utils/RandomGenerator'
import { useRenderer } from '../components/RendererContextProvider'
import React, { useEffect, useRef, useState } from 'react'

export function RNGSpamGen(): React.ReactElement {
  interface RNGGen {
    seed: number;
    count: number;
  }

  const { renderer } = useRenderer();
  const [rngGeneratorConfig, setRngGeneratorConfig] = useState<RNGGen>({ seed: 0, count: 1 });

  const generateDesign = () => {
    renderer!.logicDisplay!.components = [];
    const design: Component[] = generateRandomDesign(Math.random(), rngGeneratorConfig.count, {
      bounds: {
        minX: -5000,
        minY: -5000,
        maxX: 5000,
        maxY: 5000
      }
    });
    renderer!.logicDisplay?.importJSON(design, renderer!.logicDisplay!.components);
    renderer?.flagQuadtreeDirty(true);
    renderer?.markDirty('RNG import hehe');
  }

  return (
    <>
      <input type="number" min="0" max="2147483647" defaultValue="15" placeholder="Count" onChange={(e) => setRngGeneratorConfig({ ...rngGeneratorConfig, count: parseInt(e.target.value) })} />
      <br />
      <button onClick={generateDesign}>Generate</button>
    </>
  )
}

export function InternalUtilities(): React.ReactElement {
  const { renderer } = useRenderer();

  const copyDesignToClipboard = () => {
    if (!renderer) return;
    navigator.clipboard.writeText(renderer.logicDisplay!.exportJSON())
  }

  return (
    <>
      <button onClick={copyDesignToClipboard}>Copy design to clipboard</button>
      <button onClick={() => renderer?.logicDisplay?.uhh_yeah()}>Generate Test Components</button>
      <button onClick={() => renderer?.markDirty('Intentional dirty mark')}>Force re-render (mark dirty)</button>
    </>
  )
}
