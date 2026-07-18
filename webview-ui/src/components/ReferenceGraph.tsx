import React, { useMemo } from 'react';
import ReactFlow, { 
  Background, 
  Controls, 
  MarkerType,
  BackgroundVariant
} from 'reactflow';
import type { Node, Edge } from 'reactflow';
import 'reactflow/dist/style.css';
import { useExecutionStore } from '../store/useExecutionStore';

// Custom node style to match cyberpunk theme
const nodeStyle = {
  background: 'var(--panel-bg)',
  color: 'var(--text-primary)',
  border: '1px solid var(--neon-cyan)',
  borderRadius: '8px',
  boxShadow: 'var(--glow-cyan)',
  padding: '10px',
  fontFamily: 'monospace',
  fontSize: '12px',
  minWidth: '100px',
  textAlign: 'center' as const,
};

export const ReferenceGraph: React.FC = () => {
  const { events, currentStep } = useExecutionStore();
  const currentEvent = events[currentStep];

  // Derive nodes and edges from the current heap/scope state
  const { nodes, edges } = useMemo(() => {
    if (!currentEvent || !currentEvent.heap) {
      return { nodes: [], edges: [] };
    }

    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];

    // Map the heap objects to React Flow nodes
    Object.entries(currentEvent.heap).forEach(([id, obj], index) => {
      // Basic layout algorithm: place nodes in a grid or circle
      // For MVP, just space them out simply
      const x = (index % 3) * 200 + 50;
      const y = Math.floor(index / 3) * 150 + 50;

      newNodes.push({
        id,
        position: { x, y },
        data: { label: `${obj.type} \n ${JSON.stringify(obj.value)}` },
        style: nodeStyle,
      });

      // If the object has references to other objects, create edges
      if (obj.refs && Array.isArray(obj.refs)) {
        obj.refs.forEach((refId: string) => {
          newEdges.push({
            id: `e-${id}-${refId}`,
            source: id,
            target: refId,
            animated: true,
            style: { stroke: 'var(--neon-pink)', strokeWidth: 2 },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: 'var(--neon-pink)',
            },
          });
        });
      }
    });

    // Also add variables from the scope that reference the heap
    Object.entries(currentEvent.scope).forEach(([varName, variable], index) => {
      if (variable.ref) {
        const varNodeId = `var-${varName}`;
        newNodes.push({
          id: varNodeId,
          position: { x: 50 + index * 100, y: 0 },
          data: { label: `Var: ${varName}` },
          style: { ...nodeStyle, border: '1px solid var(--neon-purple)', boxShadow: 'var(--glow-purple)' },
        });

        newEdges.push({
          id: `e-${varNodeId}-${variable.ref}`,
          source: varNodeId,
          target: variable.ref,
          animated: true,
          style: { stroke: 'var(--neon-purple)', strokeWidth: 2, strokeDasharray: '5,5' },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: 'var(--neon-purple)',
          },
        });
      }
    });

    return { nodes: newNodes, edges: newEdges };
  }, [currentEvent]);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow 
        nodes={nodes} 
        edges={edges}
        fitView
        attributionPosition="bottom-right"
      >
        <Background 
          variant={BackgroundVariant.Dots} 
          gap={20} 
          size={1} 
          color="rgba(0, 243, 255, 0.2)" 
        />
        <Controls />
      </ReactFlow>
    </div>
  );
};
