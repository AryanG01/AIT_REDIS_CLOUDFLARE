/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */
import React, {useEffect, useRef, useState} from 'react';
import {CharacterClass} from '../characterClasses';
import {Position, GameObject, Room, BattleState, BattleAnimation} from '../types';
import {isPositionWalkable} from '../services/mapGenerator';

interface GameCanvasProps {
  character: CharacterClass;
  currentHP: number;
  playerPosition: Position;
  objects: GameObject[];
  onMove: (newPosition: Position) => void;
  onInteract: (object: GameObject) => void;
  onScreenExit: (direction: 'right' | 'left' | 'up' | 'down') => void;
  onBattleEnd: () => void;
  roomDescription: string;
  room?: Room;
  battleState: BattleState | null;
}

const VIEWPORT_WIDTH = 1000;
const VIEWPORT_HEIGHT = 800;
const PLAYER_SIZE = 35;
const MOVE_SPEED = 3;

const spriteImageCache = new Map<string, HTMLImageElement>();

function loadSpriteImage(url: string): Promise<HTMLImageElement> {
  if (spriteImageCache.has(url)) {
    return Promise.resolve(spriteImageCache.get(url)!);
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      spriteImageCache.set(url, img);
      resolve(img);
    };
    img.onerror = reject;
    img.src = url;
  });
}

function drawSprite(
  ctx: CanvasRenderingContext2D,
  obj: GameObject,
  x: number,
  y: number,
  size: number = 50
) {
  // Try to use sprite image first
  if (obj.spriteUrl) {
    const img = spriteImageCache.get(obj.spriteUrl);
    if (img) {
      ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
      return;
    } else {
      // Start loading the image
      loadSpriteImage(obj.spriteUrl).catch(() => {});
      // Fall through to emoji fallback while loading
    }
  }

  // Fallback: Draw emoji sprite if no image URL or image not loaded yet
  if (obj.sprite) {
    ctx.font = `${size}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(obj.sprite, x, y);
  }
}

function drawCharacterSprite(
  ctx: CanvasRenderingContext2D,
  character: any,
  x: number,
  y: number,
  size: number = 50,
  addGlow: boolean = true
) {
  // Try to use sprite image first
  if (character.spriteUrl) {
    const img = spriteImageCache.get(character.spriteUrl);
    if (img) {
      if (addGlow) {
        ctx.shadowColor = character.color || '#3b82f6';
        ctx.shadowBlur = 20;
      }
      ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
      if (addGlow) {
        ctx.shadowBlur = 0;
      }
      return;
    } else {
      // Start loading the image
      loadSpriteImage(character.spriteUrl).catch(() => {});
      // Fall through to emoji fallback while loading
    }
  }

  // Fallback: Draw emoji icon if no image URL or image not loaded yet
  if (character.icon) {
    if (addGlow) {
      ctx.shadowColor = character.color || '#3b82f6';
      ctx.shadowBlur = 20;
    }
    ctx.font = `${size}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(character.icon, x, y);
    if (addGlow) {
      ctx.shadowBlur = 0;
    }
  }
}

// OPTIMIZATION: Wrap with React.memo to prevent unnecessary re-renders
// Custom comparison function checks if props actually changed
const GameCanvasComponent: React.FC<GameCanvasProps> = ({
  character,
  currentHP,
  playerPosition,
  objects,
  onMove,
  onInteract,
  onScreenExit,
  onBattleEnd,
  roomDescription,
  room,
  battleState,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const [facing, setFacing] = useState<'up' | 'down' | 'left' | 'right'>('right');
  const [isMoving, setIsMoving] = useState(false);
  const animationRef = useRef<number>();
  const lastMoveTime = useRef<number>(0);
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [activeAnimations, setActiveAnimations] = useState<any[]>([]);
  const isExiting = useRef(false);

  // Camera offset for following player
  const [cameraOffset, setCameraOffset] = useState({ x: 0, y: 0 });

  // Scene image loading state
  const [sceneImageLoaded, setSceneImageLoaded] = useState(false);
  const sceneImageRef = useRef<HTMLImageElement | null>(null);

  // Handle keyboard input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) {
        e.preventDefault();
        setKeys((prev) => new Set(prev).add(key));
      }
      // Toggle debug mode with 'p' key
      if (key === 'p') {
        setIsDebugMode(prev => !prev);
      }

      // Handle battle end
      if (battleState && (battleState.status === 'player_won' || battleState.status === 'player_lost') && key === ' ') {
        onBattleEnd();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      setKeys((prev) => {
        const newKeys = new Set(prev);
        newKeys.delete(key);
        return newKeys;
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [battleState, onBattleEnd]);

  useEffect(() => {
    isExiting.current = false;
  }, [room]);

  // Load scene image when room changes
  useEffect(() => {
    if (!room?.sceneImage) {
      setSceneImageLoaded(false);
      sceneImageRef.current = null;
      return;
    }

    const img = new Image();
    img.onload = () => {
      sceneImageRef.current = img;
      setSceneImageLoaded(true);
      console.log('[GameCanvas] Scene image loaded successfully');
    };
    img.onerror = () => {
      console.error('[GameCanvas] Failed to load scene image');
      setSceneImageLoaded(false);
      sceneImageRef.current = null;
    };
    img.src = room.sceneImage;

    return () => {
      sceneImageRef.current = null;
    };
  }, [room?.sceneImage]);

  // Process animation queue
  useEffect(() => {
    if (battleState?.animationQueue && battleState.animationQueue.length > 0) {
      const newAnimations = battleState.animationQueue.map(anim => ({
        ...anim,
        id: Math.random(),
        startTime: Date.now(),
        duration: 1000, // 1 second duration for all animations
      }));
      setActiveAnimations(prev => [...prev, ...newAnimations]);
    }
  }, [battleState?.animationQueue]);

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !room?.tileMap) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const tileMap = room.tileMap;

    const gameLoop = () => {
      const isBattling = battleState?.status === 'ongoing';
      const currentTime = Date.now();

      // Update animations
      setActiveAnimations(prev => prev.filter(anim => currentTime - anim.startTime < anim.duration));

      // Disable movement and interactions during battle
      if (!isBattling) {
        // Calculate new position based on keys pressed
        let newX = playerPosition.x;
        let newY = playerPosition.y;
        let moving = false;
        let newFacing = facing;

        if (keys.has('w') || keys.has('arrowup')) {
          newY -= MOVE_SPEED;
          newFacing = 'up';
          moving = true;
        }
        if (keys.has('s') || keys.has('arrowdown')) {
          newY += MOVE_SPEED;
          newFacing = 'down';
          moving = true;
        }
        if (keys.has('a') || keys.has('arrowleft')) {
          newX -= MOVE_SPEED;
          newFacing = 'left';
          moving = true;
        }
        if (keys.has('d') || keys.has('arrowright')) {
          newX += MOVE_SPEED;
          newFacing = 'right';
          moving = true;
        }

        setIsMoving(moving);
        if (moving && newFacing !== facing) {
          setFacing(newFacing);
        }

        // Map boundaries (in pixels)
        const mapWidth = tileMap.width * tileMap.tileSize;
        const mapHeight = tileMap.height * tileMap.tileSize;

        // Check map boundaries and trigger screen exit
        // IMPORTANT: Only allow exit on RIGHT side (forward progression)
        if (!isExiting.current) {
          // Check if current position is walkable before allowing exit
          const isOnPath = isPositionWalkable(tileMap, playerPosition.x, playerPosition.y);

          if (isOnPath) {
            // Define exit buffer zone (how close to edge triggers exit)
            const exitBuffer = 40;

            // Only allow exit on RIGHT side (forward progression)
            if (newX > mapWidth - exitBuffer) {
              isExiting.current = true;
              onScreenExit('right');
              return;
            }
          }
        }

        // Collision detection with tile map
        // Player can move freely - no terrain collision!
        // The visual path serves as a guide, not a constraint

        // Keep player within bounds
        newX = Math.max(PLAYER_SIZE / 2, Math.min(mapWidth - PLAYER_SIZE / 2, newX));
        newY = Math.max(PLAYER_SIZE / 2, Math.min(mapHeight - PLAYER_SIZE / 2, newY));

        // Update position if changed
        if (newX !== playerPosition.x || newY !== playerPosition.y) {
          onMove({x: newX, y: newY});
        }

        // Update camera to follow player
        const targetCameraX = Math.max(0, Math.min(newX - VIEWPORT_WIDTH / 2, mapWidth - VIEWPORT_WIDTH));
        const targetCameraY = Math.max(0, Math.min(newY - VIEWPORT_HEIGHT / 2, mapHeight - VIEWPORT_HEIGHT));

        // Smooth camera movement
        setCameraOffset({
          x: targetCameraX,
          y: targetCameraY,
        });

        // Check for interactions with space bar (throttled)
        if (keys.has(' ') && currentTime - lastMoveTime.current > 500) {
          lastMoveTime.current = currentTime;

          // Find the closest interactable object within range
          let closestObject: GameObject | null = null;
          let closestDistance = Infinity;

          objects.forEach((obj) => {
            if (obj.hasInteracted) return; // Skip already interacted objects

            const distance = Math.sqrt(
              Math.pow(playerPosition.x - obj.position.x, 2) +
                Math.pow(playerPosition.y - obj.position.y, 2),
            );

            if (distance < 60 && distance < closestDistance) {
              closestDistance = distance;
              closestObject = obj;
            }
          });

          // Interact with only the closest object
          if (closestObject) {
            onInteract(closestObject);
          }
        }
      }

      // Render
      render(ctx, tileMap, []);

      animationRef.current = requestAnimationFrame(gameLoop);
    };

    const render = (ctx: CanvasRenderingContext2D, tileMap: any, checkPoints: any[]) => {
      // Clear canvas
      ctx.fillStyle = '#0f0f1e';
      ctx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

      // Save context for camera transform
      ctx.save();
      ctx.translate(-cameraOffset.x, -cameraOffset.y);

      // Draw scene image if available, otherwise fall back to tiles
      if (sceneImageLoaded && sceneImageRef.current) {
        // Draw the generated scene image as background
        const mapWidth = tileMap.width * tileMap.tileSize;
        const mapHeight = tileMap.height * tileMap.tileSize;

        // Draw scene stretched to fit the map dimensions
        ctx.drawImage(sceneImageRef.current, 0, 0, mapWidth, mapHeight);

        // Optionally add a subtle overlay for depth
        ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
        ctx.fillRect(0, 0, mapWidth, mapHeight);
      } else {
        // Fallback: Draw tile map
        for (let y = 0; y < tileMap.height; y++) {
          for (let x = 0; x < tileMap.width; x++) {
            const tile = tileMap.tiles[y][x];
            const tileX = x * tileMap.tileSize;
            const tileY = y * tileMap.tileSize;

            // Draw tile background
            ctx.fillStyle = tile.color;
            ctx.fillRect(tileX, tileY, tileMap.tileSize, tileMap.tileSize);
          }
        }

        // Show loading indicator if scene is being generated
        if (room?.sceneImageLoading) {
          const mapWidth = tileMap.width * tileMap.tileSize;
          const mapHeight = tileMap.height * tileMap.tileSize;
          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
          ctx.fillRect(0, 0, mapWidth, mapHeight);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 32px Arial';
          ctx.textAlign = 'center';
          ctx.fillText('Generating scene...', mapWidth / 2, mapHeight / 2);
        }
      }

      // DEBUG MODE: Draw tile grid overlay
      if (isDebugMode) {
        for (let y = 0; y < tileMap.height; y++) {
          for (let x = 0; x < tileMap.width; x++) {
            const tile = tileMap.tiles[y][x];
            const tileX = x * tileMap.tileSize;
            const tileY = y * tileMap.tileSize;
            ctx.fillStyle = tile.walkable ? 'rgba(0, 255, 0, 0.2)' : 'rgba(255, 0, 0, 0.2)';
            ctx.fillRect(tileX, tileY, tileMap.tileSize, tileMap.tileSize);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.strokeRect(tileX, tileY, tileMap.tileSize, tileMap.tileSize);
          }
        }
      }

      // Find the closest interactable object for enhanced visual feedback
      let closestInteractableObject: GameObject | null = null;
      let closestInteractableDistance = Infinity;

      objects.forEach((obj) => {
        if (obj.hasInteracted) return;

        const distance = Math.sqrt(
          Math.pow(playerPosition.x - obj.position.x, 2) +
            Math.pow(playerPosition.y - obj.position.y, 2),
        );

        if (distance < 60 && distance < closestInteractableDistance) {
          closestInteractableDistance = distance;
          closestInteractableObject = obj;
        }
      });

      // Draw objects
      objects.forEach((obj) => {
        const isClosest = obj === closestInteractableObject;

        // Draw object shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath();
        ctx.ellipse(obj.position.x, obj.position.y + 20, 18, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        // Draw object sprite with slight bounce animation
        const bounce = isMoving ? Math.sin(Date.now() / 200) * 2 : 0;
        ctx.font = '40px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Glow for interactable objects
        const distance = Math.sqrt(
          Math.pow(playerPosition.x - obj.position.x, 2) +
            Math.pow(playerPosition.y - obj.position.y, 2),
        );

        if (distance < 60 && !obj.hasInteracted) {
          const glowColor = obj.type === 'enemy' ? '#ef4444' : obj.type === 'item' ? '#fbbf24' : '#3b82f6';
          ctx.shadowColor = glowColor;
          // Closest object gets MUCH stronger glow
          ctx.shadowBlur = isClosest ? 40 : 15;

          // Draw a pulsing circle around the closest object
          if (isClosest) {
            ctx.strokeStyle = glowColor;
            ctx.lineWidth = 3;
            const pulseRadius = 35 + Math.sin(Date.now() / 150) * 8;
            ctx.beginPath();
            ctx.arc(obj.position.x, obj.position.y, pulseRadius, 0, Math.PI * 2);
            ctx.stroke();
          }
        }

        drawSprite(ctx, obj, obj.position.x, obj.position.y + bounce, 75);
        ctx.shadowBlur = 0;

        // Draw interaction indicator - ONLY for the closest object
        if (isClosest && !obj.hasInteracted) {
          ctx.fillStyle = '#fbbf24';
          ctx.font = 'bold 14px Arial';
          const pulseSize = 14 + Math.sin(Date.now() / 200) * 2;
          ctx.font = `bold ${pulseSize}px Arial`;
          ctx.fillText('⬆ SPACE', obj.position.x, obj.position.y - 40);

          // Draw a line connecting player to closest object
          ctx.strokeStyle = 'rgba(251, 191, 36, 0.4)';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(playerPosition.x, playerPosition.y);
          ctx.lineTo(obj.position.x, obj.position.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      });

      // Draw player with walking animation
      const playerBounce = isMoving ? Math.sin(Date.now() / 100) * 3 : 0;

      ctx.font = `${PLAYER_SIZE}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      drawCharacterSprite(ctx, character, playerPosition.x, playerPosition.y + playerBounce, 75);

      // DEBUG MODE: Draw collision points
      if (isDebugMode) {
        ctx.fillStyle = 'cyan';
        checkPoints.forEach(p => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3, 0, 2 * Math.PI);
          ctx.fill();
        });
      }

      // Direction indicator (small arrow)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.font = '16px Arial';
      const indicators = { up: '▲', down: '▼', left: '◀', right: '▶' };
      ctx.fillText(indicators[facing], playerPosition.x, playerPosition.y - 30);

      // Restore context
      ctx.restore();

      // BATTLE MODE OVERLAY
      if (battleState?.status === 'ongoing') {
        // Darken the background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

        // Player position and rendering
        const playerBattleX = VIEWPORT_WIDTH * 0.25;
        const playerBattleY = VIEWPORT_HEIGHT / 2;
        ctx.font = '80px Arial';
        drawCharacterSprite(ctx, character, playerBattleX, playerBattleY, 150);

        // Enemy position and rendering
        const enemyBattleX = VIEWPORT_WIDTH * 0.75;
        const enemyBattleY = VIEWPORT_HEIGHT / 2;
        ctx.font = '80px Arial';
        drawSprite(ctx, battleState.enemy, enemyBattleX, enemyBattleY, 150);

        // Draw HP bars
        const drawHpBar = (x: number, y: number, currentHp: number, maxHp: number, color: string) => {
          const barWidth = 150;
          const barHeight = 20;
          const hpPercentage = Math.max(0, currentHp / maxHp);

          ctx.fillStyle = '#333';
          ctx.fillRect(x - barWidth / 2, y - 80, barWidth, barHeight);

          ctx.fillStyle = color;
          ctx.fillRect(x - barWidth / 2, y - 80, barWidth * hpPercentage, barHeight);

          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.strokeRect(x - barWidth / 2, y - 80, barWidth, barHeight);

          ctx.fillStyle = '#fff';
          ctx.font = 'bold 16px Arial';
          ctx.textAlign = 'center';
          ctx.fillText(`${currentHp} / ${maxHp}`, x, y - 65);
        };

        // Draw player HP bar
        drawHpBar(playerBattleX, playerBattleY, currentHP, character.startingHP, '#22c55e');

        // Draw enemy HP bar
        drawHpBar(enemyBattleX, enemyBattleY, battleState.enemyHP, battleState.maxEnemyHP, '#ef4444');

        // Draw animations
        activeAnimations.forEach(anim => {
          const elapsedTime = Date.now() - anim.startTime;
          const progress = elapsedTime / anim.duration;
          const alpha = 1 - progress;

          if (anim.type === 'slash') {
            const targetX = anim.target === 'player' ? playerBattleX : enemyBattleX;
            const targetY = anim.target === 'player' ? playerBattleY : enemyBattleY;
            ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.moveTo(targetX - 30, targetY - 30);
            ctx.lineTo(targetX + 30, targetY + 30);
            ctx.stroke();
          } else if (anim.type === 'damageNumber') {
            const targetX = anim.target === 'player' ? playerBattleX : enemyBattleX;
            const targetY = anim.target === 'player' ? playerBattleY : enemyBattleY;
            const yOffset = -50 - (progress * 50);
            ctx.fillStyle = `rgba(255, 255, 0, ${alpha})`;
            ctx.font = 'bold 36px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(anim.value, targetX, targetY + yOffset);
          }
        });

      } else if (battleState && (battleState.status === 'player_won' || battleState.status === 'player_lost')) {
        // Darken the background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

        ctx.fillStyle = battleState.status === 'player_won' ? '#22c55e' : '#ef4444';
        ctx.font = 'bold 60px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(battleState.status === 'player_won' ? 'YOU WIN!' : 'YOU LOSE!', VIEWPORT_WIDTH / 2, VIEWPORT_HEIGHT / 2);

        ctx.fillStyle = '#fff';
        ctx.font = '24px Arial';
        ctx.fillText('Press SPACE to continue', VIEWPORT_WIDTH / 2, VIEWPORT_HEIGHT / 2 + 60);
      }

      // Draw UI overlay (not affected by camera)
      // Room description at top
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(0, 0, VIEWPORT_WIDTH, 70);

      // Gradient border
      const gradient = ctx.createLinearGradient(0, 70, VIEWPORT_WIDTH, 70);
      gradient.addColorStop(0, 'rgba(139, 92, 246, 0)');
      gradient.addColorStop(0.5, 'rgba(139, 92, 246, 0.8)');
      gradient.addColorStop(1, 'rgba(139, 92, 246, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 70, VIEWPORT_WIDTH, 3);

      ctx.fillStyle = '#e5e7eb';
      ctx.font = 'bold 24px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(roomDescription, VIEWPORT_WIDTH / 2, 35);

      // Controls hint at bottom
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(0, VIEWPORT_HEIGHT - 50, VIEWPORT_WIDTH, 50);

      const controlsGradient = ctx.createLinearGradient(0, VIEWPORT_HEIGHT - 50, VIEWPORT_WIDTH, VIEWPORT_HEIGHT - 50);
      controlsGradient.addColorStop(0, 'rgba(139, 92, 246, 0)');
      controlsGradient.addColorStop(0.5, 'rgba(139, 92, 246, 0.8)');
      controlsGradient.addColorStop(1, 'rgba(139, 92, 246, 0)');
      ctx.fillStyle = controlsGradient;
      ctx.fillRect(0, VIEWPORT_HEIGHT - 53, VIEWPORT_WIDTH, 3);

      ctx.fillStyle = '#9ca3af';
      ctx.font = '16px Arial';
      ctx.fillText(
        '⬆⬇⬅➡ Move | SPACE: Interact | P: Toggle Path Debugger',
        VIEWPORT_WIDTH / 2,
        VIEWPORT_HEIGHT - 25,
      );

      // Mini-map in corner
      const miniMapSize = 150;
      const miniMapX = VIEWPORT_WIDTH - miniMapSize - 20;
      const miniMapY = 90;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(miniMapX, miniMapY, miniMapSize, miniMapSize);
      ctx.strokeStyle = '#8b5cf6';
      ctx.lineWidth = 2;
      ctx.strokeRect(miniMapX, miniMapY, miniMapSize, miniMapSize);

      // Draw simplified map
      const scaleX = miniMapSize / (tileMap.width * tileMap.tileSize);
      const scaleY = miniMapSize / (tileMap.height * tileMap.tileSize);

      // Draw path
      ctx.fillStyle = '#4ade80';
      tileMap.pathPoints.forEach((point: any) => {
        const x = miniMapX + point.x * scaleX;
        const y = miniMapY + point.y * scaleY;
        ctx.fillRect(x, y, 2, 2);
      });

      // Draw objects
      objects.forEach((obj) => {
        const x = miniMapX + obj.position.x * scaleX;
        const y = miniMapY + obj.position.y * scaleY;
        ctx.fillStyle = obj.type === 'enemy' ? '#ef4444' : obj.type === 'item' ? '#fbbf24' : '#3b82f6';
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw player position
      const playerMiniX = miniMapX + playerPosition.x * scaleX;
      const playerMiniY = miniMapY + playerPosition.y * scaleY;
      ctx.fillStyle = character.color;
      ctx.beginPath();
      ctx.arc(playerMiniX, playerMiniY, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    };

    animationRef.current = requestAnimationFrame(gameLoop);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [playerPosition, objects, keys, character, onMove, onInteract, onScreenExit, roomDescription, room, facing, isMoving, cameraOffset, isDebugMode, battleState]);

  return (
    <div
      className="flex items-center justify-center w-full h-full"
      style={{ backgroundColor: '#1a1a1a' }}
    >
      <canvas
        ref={canvasRef}
        width={VIEWPORT_WIDTH}
        height={VIEWPORT_HEIGHT}
        style={{
          imageRendering: 'pixelated',
          border: '8px solid #5c3d2e',
          borderRadius: '4px',
          boxShadow: '0 12px 0 #3d2817, inset 0 4px 0 rgba(255,255,255,0.05)'
        }}
      />
    </div>
  );
};

// OPTIMIZATION: Export memoized version with custom comparison
// Only re-render if actual game state changed (not on every parent render)
export const GameCanvas = React.memo(
  GameCanvasComponent,
  (prevProps, nextProps) => {
    // Return true if props are equal (skip re-render)
    // Return false if props changed (trigger re-render)

    // Check position (most frequent change)
    if (
      prevProps.playerPosition.x !== nextProps.playerPosition.x ||
      prevProps.playerPosition.y !== nextProps.playerPosition.y
    ) {
      return false; // Position changed, re-render
    }

    // Check HP
    if (prevProps.currentHP !== nextProps.currentHP) {
      return false;
    }

    // Check character (rarely changes but important)
    if (prevProps.character.name !== nextProps.character.name) {
      return false;
    }

    // Check room (scene image)
    if (prevProps.room?.sceneImage !== nextProps.room?.sceneImage) {
      return false;
    }

    // Check objects array (expensive, so check reference first)
    if (prevProps.objects !== nextProps.objects) {
      // Arrays are different references, check length first
      if (prevProps.objects.length !== nextProps.objects.length) {
        return false;
      }

      // Check if any object IDs changed (quick check)
      const prevIds = prevProps.objects.map(o => o.id).sort().join(',');
      const nextIds = nextProps.objects.map(o => o.id).sort().join(',');
      if (prevIds !== nextIds) {
        return false;
      }
    }

    // Check battle state
    if (prevProps.battleState?.status !== nextProps.battleState?.status) {
      return false;
    }

    // All important props are the same, skip re-render
    return true;
  }
);
