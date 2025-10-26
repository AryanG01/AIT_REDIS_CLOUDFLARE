/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
/* tslint:disable */
import { Room } from '../types';
import { getApiBaseUrl } from './apiConfig';

const ROOM_CACHE_KEY = 'roguelike_room_cache';
const CACHE_VERSION = 2;

interface CachedRoomData {
  version: number;
  storySeed: number;
  rooms: { [roomId: string]: Room };
  timestamp: number;
}

export class RoomCache {
  private storySeed: number = 0;

  initialize(storySeed: number): void {
    this.storySeed = storySeed;
  }

  getCachedRooms(): Map<string, Room> | null {
    try {
      const cached = localStorage.getItem(ROOM_CACHE_KEY);
      if (!cached) return null;

      const data: CachedRoomData = JSON.parse(cached);

      if (data.version !== CACHE_VERSION || data.storySeed !== this.storySeed) {
        console.log('[RoomCache] Cache invalid: version or seed mismatch');
        return null;
      }

      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000;
      if (now - data.timestamp > maxAge) {
        console.log('[RoomCache] Cache expired');
        return null;
      }

      const rooms = new Map<string, Room>();
      Object.entries(data.rooms).forEach(([id, room]) => {
        rooms.set(id, room);
      });

      console.log(`[RoomCache] Loaded ${rooms.size} rooms from cache`);
      return rooms;
    } catch (error) {
      console.error('[RoomCache] Failed to load cache:', error);
      return null;
    }
  }

  getRoom(roomId: string): Room | null {
    try {
      const cached = localStorage.getItem(ROOM_CACHE_KEY);
      if (!cached) return null;

      const data: CachedRoomData = JSON.parse(cached);

      if (data.version !== CACHE_VERSION || data.storySeed !== this.storySeed) {
        return null;
      }

      const room = data.rooms[roomId];
      if (room) {
        console.log(`[RoomCache] Cache hit for ${roomId}`);
        return room;
      }

      return null;
    } catch (error) {
      console.error('[RoomCache] Failed to get room:', error);
      return null;
    }
  }

  /**
   * Get room with multi-tier caching (localStorage → KV → generate)
   * This is an async version that checks KV cache if localStorage misses
   */
  async getRoomMultiTier(roomId: string): Promise<Room | null> {
    // L1: Check localStorage first
    const localHit = this.getRoom(roomId);
    if (localHit) {
      console.log('[RoomCache] L1 HIT (localStorage)');
      return localHit;
    }

    // L2: Check KV cache via API
    try {
      const cacheKey = `${this.storySeed}:${roomId}`;
      const response = await fetch(`${getApiBaseUrl()}/api/cache/room/${encodeURIComponent(cacheKey)}`);

      if (response.ok) {
        const data = await response.json();
        if (data.cached && data.data) {
          console.log('[RoomCache] L2 HIT (KV)');

          // Store in localStorage for next time
          const room = data.data as Room;
          this.saveRoom(room);

          return room;
        }
      }
    } catch (error) {
      console.warn('[RoomCache] KV lookup failed, falling back to local only:', error);
    }

    // No cache hit
    return null;
  }

  /**
   * Save room to both localStorage and KV cache
   */
  async saveRoomMultiTier(room: Room, saveToKV: boolean = true): Promise<void> {
    // Always save to localStorage
    this.saveRoom(room);

    // Optionally save to KV for cross-user sharing
    if (saveToKV) {
      try {
        await fetch(`${getApiBaseUrl()}/api/cache/room`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            room,
            storySeed: this.storySeed,
          }),
        });

        console.log('[RoomCache] Saved to KV cache');
      } catch (error) {
        console.warn('[RoomCache] Failed to save to KV:', error);
        // Non-fatal - already saved to localStorage
      }
    }
  }

  saveRoom(room: Room): void {
    try {
      let data: CachedRoomData;
      const cached = localStorage.getItem(ROOM_CACHE_KEY);

      if (cached) {
        data = JSON.parse(cached);
        if (data.version !== CACHE_VERSION || data.storySeed !== this.storySeed) {
          data = {
            version: CACHE_VERSION,
            storySeed: this.storySeed,
            rooms: {},
            timestamp: Date.now(),
          };
        }
      } else {
        data = {
          version: CACHE_VERSION,
          storySeed: this.storySeed,
          rooms: {},
          timestamp: Date.now(),
        };
      }

      data.rooms[room.id] = room;
      data.timestamp = Date.now();

      // Implement LRU eviction: Keep only the 5 most recent rooms
      const roomIds = Object.keys(data.rooms);
      if (roomIds.length > 5) {
        // Sort by room number (extract from room_X format)
        roomIds.sort((a, b) => {
          const numA = parseInt(a.split('_')[1] || '0');
          const numB = parseInt(b.split('_')[1] || '0');
          return numA - numB;
        });
        // Remove oldest rooms (keep last 5)
        const toRemove = roomIds.slice(0, roomIds.length - 5);
        toRemove.forEach(id => delete data.rooms[id]);
        console.log(`[RoomCache] Evicted ${toRemove.length} old rooms (LRU policy)`);
      }

      localStorage.setItem(ROOM_CACHE_KEY, JSON.stringify(data));
      console.log(`[RoomCache] Saved ${room.id} to cache`);
    } catch (error) {
      // Handle QuotaExceededError specifically
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        console.warn('[RoomCache] Storage quota exceeded, clearing cache...');
        this.clear();
        // Try one more time with just this room
        try {
          const freshData: CachedRoomData = {
            version: CACHE_VERSION,
            storySeed: this.storySeed,
            rooms: { [room.id]: room },
            timestamp: Date.now(),
          };
          localStorage.setItem(ROOM_CACHE_KEY, JSON.stringify(freshData));
          console.log(`[RoomCache] Saved ${room.id} to fresh cache after quota clear`);
        } catch (retryError) {
          console.error('[RoomCache] Failed to save even after clearing cache:', retryError);
        }
      } else {
        console.error('[RoomCache] Failed to save room:', error);
      }
    }
  }

  saveRooms(rooms: Map<string, Room>): void {
    try {
      const roomsObj: { [key: string]: Room } = {};

      // Only cache the 5 most recent rooms to prevent quota issues
      const roomArray = Array.from(rooms.entries());
      const recentRooms = roomArray.slice(-5);

      recentRooms.forEach(([id, room]) => {
        roomsObj[id] = room;
      });

      const data: CachedRoomData = {
        version: CACHE_VERSION,
        storySeed: this.storySeed,
        rooms: roomsObj,
        timestamp: Date.now(),
      };

      localStorage.setItem(ROOM_CACHE_KEY, JSON.stringify(data));
      console.log(`[RoomCache] Saved ${Object.keys(roomsObj).length} rooms to cache (limited to 5 most recent)`);
    } catch (error) {
      // Handle QuotaExceededError specifically
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        console.warn('[RoomCache] Storage quota exceeded when saving multiple rooms, clearing cache...');
        this.clear();
      } else {
        console.error('[RoomCache] Failed to save rooms:', error);
      }
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(ROOM_CACHE_KEY);
      console.log('[RoomCache] Cache cleared');
    } catch (error) {
      console.error('[RoomCache] Failed to clear cache:', error);
    }
  }

  reset(): void {
    this.clear();
    this.storySeed = 0;
  }
}

export const roomCache = new RoomCache();
