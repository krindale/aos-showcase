// A* Pathfinding utilities with binary heap priority queue
// Provides O(n log n) pathfinding for AI track construction decisions

import { HexCoord } from '@/types/game';
import { hexDistance, getNeighborHex } from './hexGrid';

/**
 * Generic binary min-heap implementation for priority queue
 * Provides O(log n) insert and extractMin operations
 *
 * @template T The type of elements stored in the heap
 */
export class MinHeap<T> {
  private heap: T[] = [];
  private compareFn: (a: T, b: T) => number;

  /**
   * Creates a new MinHeap instance
   * @param compareFn Comparison function that returns negative if a < b, positive if a > b, zero if equal
   */
  constructor(compareFn: (a: T, b: T) => number) {
    this.compareFn = compareFn;
  }

  /**
   * Returns the number of elements in the heap
   */
  get size(): number {
    return this.heap.length;
  }

  /**
   * Checks if the heap is empty
   */
  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  /**
   * Inserts an element into the heap
   * Time complexity: O(log n)
   * @param element Element to insert
   */
  insert(element: T): void {
    this.heap.push(element);
    this.heapifyUp(this.heap.length - 1);
  }

  /**
   * Removes and returns the minimum element (root of the heap)
   * Time complexity: O(log n)
   * @returns The minimum element, or undefined if heap is empty
   */
  extractMin(): T | undefined {
    if (this.isEmpty()) {
      return undefined;
    }

    if (this.heap.length === 1) {
      return this.heap.pop();
    }

    const min = this.heap[0];
    this.heap[0] = this.heap.pop()!;
    this.heapifyDown(0);
    return min;
  }

  /**
   * Returns the minimum element without removing it
   * Time complexity: O(1)
   * @returns The minimum element, or undefined if heap is empty
   */
  peek(): T | undefined {
    return this.heap[0];
  }

  /**
   * Moves an element up the heap to maintain heap property
   * @param index Index of the element to move up
   */
  private heapifyUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.compareFn(this.heap[index], this.heap[parentIndex]) >= 0) {
        break;
      }
      // Swap with parent
      [this.heap[index], this.heap[parentIndex]] = [this.heap[parentIndex], this.heap[index]];
      index = parentIndex;
    }
  }

  /**
   * Moves an element down the heap to maintain heap property
   * @param index Index of the element to move down
   */
  private heapifyDown(index: number): void {
    while (true) {
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;
      let smallest = index;

      if (
        leftChild < this.heap.length &&
        this.compareFn(this.heap[leftChild], this.heap[smallest]) < 0
      ) {
        smallest = leftChild;
      }

      if (
        rightChild < this.heap.length &&
        this.compareFn(this.heap[rightChild], this.heap[smallest]) < 0
      ) {
        smallest = rightChild;
      }

      if (smallest === index) {
        break;
      }

      // Swap with smallest child
      [this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]];
      index = smallest;
    }
  }
}

// === A* Pathfinding Implementation ===

/**
 * A* node for tracking pathfinding state
 */
interface AStarNode {
  coord: HexCoord;
  gScore: number;  // Cost from start to this node
  fScore: number;  // gScore + heuristic (estimated total cost)
  parent: HexCoord | null;
}

/**
 * Creates a unique key for a hex coordinate
 */
function coordKey(coord: HexCoord): string {
  return `${coord.col},${coord.row}`;
}

/**
 * Compares two hex coordinates for equality
 */
function coordEquals(a: HexCoord, b: HexCoord): boolean {
  return a.col === b.col && a.row === b.row;
}

/**
 * A* pathfinding algorithm with hexagonal distance heuristic
 *
 * Finds the optimal path from start to goal on a hexagonal grid.
 * Uses hexagonal distance (Manhattan distance on hex grid) as the heuristic.
 *
 * Time complexity: O(n log n) where n is the number of explored nodes
 * Space complexity: O(n) for the open and closed sets
 *
 * @param start Starting hex coordinate
 * @param goal Goal hex coordinate
 * @param isWalkable Function to check if a hex coordinate is walkable
 * @param getCost Optional function to get movement cost between adjacent hexes (default: 1)
 * @returns Array of hex coordinates from start to goal (inclusive), or null if no path exists
 *
 * @example
 * ```typescript
 * const path = findOptimalPath(
 *   { col: 0, row: 0 },
 *   { col: 5, row: 5 },
 *   (coord) => !hasObstacle(coord),
 *   (from, to) => getTerrain(to) === 'mountain' ? 2 : 1
 * );
 * ```
 */
export function findOptimalPath(
  start: HexCoord,
  goal: HexCoord,
  isWalkable: (coord: HexCoord) => boolean,
  getCost: (from: HexCoord, to: HexCoord) => number = () => 1
): HexCoord[] | null {
  // Early exit if start or goal is not walkable
  if (!isWalkable(start) || !isWalkable(goal)) {
    return null;
  }

  // Early exit if start equals goal
  if (coordEquals(start, goal)) {
    return [start];
  }

  // Open set: nodes to be evaluated (priority queue by fScore)
  const openSet = new MinHeap<AStarNode>((a, b) => a.fScore - b.fScore);

  // Track best gScore for each coordinate
  const gScores = new Map<string, number>();

  // Track parent for path reconstruction
  const parents = new Map<string, HexCoord>();

  // Closed set: nodes already evaluated
  const closedSet = new Set<string>();

  // Initialize start node
  const startKey = coordKey(start);
  const startNode: AStarNode = {
    coord: start,
    gScore: 0,
    fScore: hexDistance(start, goal),
    parent: null,
  };

  openSet.insert(startNode);
  gScores.set(startKey, 0);

  // Main A* loop
  while (!openSet.isEmpty()) {
    // Get node with lowest fScore
    const current = openSet.extractMin()!;
    const currentKey = coordKey(current.coord);

    // Skip if already processed (can happen with duplicate insertions)
    if (closedSet.has(currentKey)) {
      continue;
    }

    // Mark as processed
    closedSet.add(currentKey);

    // Check if we reached the goal
    if (coordEquals(current.coord, goal)) {
      // Reconstruct path
      const path: HexCoord[] = [];
      let pathCoord: HexCoord | null = current.coord;

      while (pathCoord !== null) {
        path.unshift(pathCoord);
        pathCoord = parents.get(coordKey(pathCoord)) || null;
      }

      return path;
    }

    // Explore neighbors (all 6 directions)
    for (let edge = 0; edge < 6; edge++) {
      const neighbor = getNeighborHex(current.coord, edge);
      const neighborKey = coordKey(neighbor);

      // Skip if already processed
      if (closedSet.has(neighborKey)) {
        continue;
      }

      // Skip if not walkable
      if (!isWalkable(neighbor)) {
        continue;
      }

      // Calculate tentative gScore
      const moveCost = getCost(current.coord, neighbor);
      const tentativeGScore = current.gScore + moveCost;

      // Check if this path to neighbor is better than any previous one
      const previousGScore = gScores.get(neighborKey);
      if (previousGScore === undefined || tentativeGScore < previousGScore) {
        // This path is better, record it
        gScores.set(neighborKey, tentativeGScore);
        parents.set(neighborKey, current.coord);

        // Add to open set
        const neighborNode: AStarNode = {
          coord: neighbor,
          gScore: tentativeGScore,
          fScore: tentativeGScore + hexDistance(neighbor, goal),
          parent: current.coord,
        };

        openSet.insert(neighborNode);
      }
    }
  }

  // No path found
  return null;
}
