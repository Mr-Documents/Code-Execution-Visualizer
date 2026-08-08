import React, { useMemo } from 'react';
import ReactFlow, { Background, Controls, MarkerType, BackgroundVariant } from 'reactflow';
import type { Node, Edge } from 'reactflow';
import 'reactflow/dist/style.css';
import { useExecutionStore, selectStateEvent } from '../store/useExecutionStore';

const NODE_STYLE = {
  background: 'var(--panel-bg)',
  color: 'var(--text-primary)',
  border: '1px solid var(--neon-cyan)',
  borderRadius: '8px',
  boxShadow: 'var(--glow-cyan)',
  padding: '10px',
  fontFamily: 'monospace',
  fontSize: '12px',
  minWidth: '100px',
  textAlign: 'center' as const
};

const VARIABLE_NODE_STYLE = {
  ...NODE_STYLE,
  border: '1px solid var(--neon-purple)',
  boxShadow: 'var(--glow-purple)'
};

const COLUMNS = 3;
const COLUMN_WIDTH = 200;
const ROW_HEIGHT = 150;

/** Keeps node labels readable when an object holds a lot of data. */
function formatValue(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (!text) return '';
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

/** Visualizes heap objects and the references between them. */
export const ReferenceGraph: React.FC = () => {
  const events = useExecutionStore((state) => state.events);
  const currentStep = useExecutionStore((state) => state.currentStep);
  // Terminal events carry no state; show the last state that existed instead
  // of blanking the graph the moment the program finishes.
  const currentEvent = selectStateEvent(events, currentStep);

  const { nodes, edges } = useMemo(() => {
    const heap = currentEvent?.heap;
    if (!heap) return { nodes: [] as Node[], edges: [] as Edge[] };

    const nodes: Node[] = [];
    const edges: Edge[] = [];

    Object.entries(heap).forEach(([id, object], index) => {
      nodes.push({
        id,
        position: {
          x: (index % COLUMNS) * COLUMN_WIDTH + 50,
          y: Math.floor(index / COLUMNS) * ROW_HEIGHT + 50
        },
        data: {
          label: `${object.type}${object.truncated ? ' (truncated)' : ''}\n${formatValue(object.value)}`
        },
        style: NODE_STYLE
      });
    });

    // ReactFlow throws on an edge whose endpoint doesn't exist. Truncated or
    // failed traversals can leave references pointing at objects that were
    // never recorded, so every endpoint is checked before the edge is added.
    const exists = (id: string) => Object.prototype.hasOwnProperty.call(heap, id);

    Object.entries(heap).forEach(([id, object]) => {
      for (const refId of object.refs ?? []) {
        if (!exists(refId)) continue;
        edges.push({
          id: `e-${id}-${refId}`,
          source: id,
          target: refId,
          animated: true,
          style: { stroke: 'var(--neon-pink)', strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--neon-pink)' }
        });
      }
    });

    Object.entries(currentEvent.scope ?? {}).forEach(([name, variable], index) => {
      if (!variable.ref || !exists(variable.ref)) return;

      const variableNodeId = `var-${name}`;
      nodes.push({
        id: variableNodeId,
        position: { x: 50 + index * 100, y: 0 },
        data: { label: `Var: ${name}` },
        style: VARIABLE_NODE_STYLE
      });

      edges.push({
        id: `e-${variableNodeId}-${variable.ref}`,
        source: variableNodeId,
        target: variable.ref,
        animated: true,
        style: { stroke: 'var(--neon-purple)', strokeWidth: 2, strokeDasharray: '5,5' },
        markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--neon-purple)' }
      });
    });

    return { nodes, edges };
  }, [currentEvent]);

  if (nodes.length === 0) {
    return (
      <div className="placeholder" style={{ padding: '1rem' }}>
        No objects in memory at this step. Arrays, objects and functions appear
        here as they are created.
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow nodes={nodes} edges={edges} fitView attributionPosition="bottom-right">
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(0, 243, 255, 0.2)" />
        <Controls />
      </ReactFlow>
    </div>
  );
};
