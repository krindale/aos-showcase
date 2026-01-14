// A* Pathfinding utilities with binary heap priority queue
// Provides O(n log n) pathfinding for AI track construction decisions

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
