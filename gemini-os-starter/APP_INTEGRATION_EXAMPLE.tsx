/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * EXAMPLE: How to add click-to-play speech to your App.tsx
 *
 * This file shows you exactly where to add speech components
 */

import React from 'react';
import { SpeakableText, DialogueBox, NPCInteraction } from './components/SpeakableText';
import { SpeechButton } from './components/SpeechButton';
import { VoiceControls } from './components/VoiceControls';
import { GameObject, BattleState } from './types';

/**
 * EXAMPLE 1: Add voice controls to your game header
 */
function GameHeader() {
  return (
    <div className="game-header" style={{
      display: 'flex',
      justifyContent: 'space-between',
      padding: '12px',
      backgroundColor: '#1a1a1a',
      borderBottom: '2px solid #333'
    }}>
      <h1>My Game</h1>

      {/* Add voice controls in corner */}
      <VoiceControls compact />
    </div>
  );
}

/**
 * EXAMPLE 2: Room description with clickable narration
 */
function RoomView({ room }: { room: any }) {
  return (
    <div className="room-view" style={{ padding: '20px' }}>
      <h2>{room.id}</h2>

      {/* Clickable room description */}
      <SpeakableText
        text={room.description}
        characterType="narrator"
        emotion="mysterious"
        buttonSize="medium"
        style={{
          fontSize: '16px',
          lineHeight: '1.6',
          color: '#ddd',
          padding: '16px',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          borderRadius: '8px',
        }}
      >
        {room.description}
      </SpeakableText>
    </div>
  );
}

/**
 * EXAMPLE 3: GameObject/NPC interactions with speech
 */
function GameObjectDisplay({ object, onInteract }: { object: GameObject; onInteract: () => void }) {
  return (
    <div
      className="game-object"
      style={{
        margin: '8px',
        cursor: 'pointer',
        transition: 'transform 0.2s',
      }}
      onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
      onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
    >
      {/* Use NPCInteraction component */}
      <NPCInteraction
        npc={{
          sprite: object.sprite,
          type: object.type,
          interactionText: object.interactionText,
        }}
        onClick={onInteract}
      />
    </div>
  );
}

/**
 * EXAMPLE 4: AI-generated dialogue with speech
 */
function AIDialogueDisplay({ sceneData }: { sceneData: any }) {
  if (!sceneData) return null;

  return (
    <div className="ai-dialogue" style={{
      position: 'fixed',
      bottom: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      maxWidth: '600px',
      width: '90%',
    }}>
      {/* Display narration with speech button */}
      {sceneData.narration && (
        <DialogueBox
          speaker="Narrator"
          text={sceneData.narration}
          characterType="narrator"
          emotion="neutral"
        />
      )}

      {/* Display choices with individual speech buttons */}
      <div className="choices" style={{ marginTop: '12px' }}>
        {sceneData.choices?.map((choice: any) => (
          <button
            key={choice.id}
            className="choice-button"
            onClick={() => handleChoice(choice)}
            style={{
              width: '100%',
              padding: '12px',
              marginBottom: '8px',
              backgroundColor: 'rgba(33, 150, 243, 0.2)',
              border: '2px solid #2196F3',
              borderRadius: '8px',
              color: '#fff',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            {/* Each choice gets a speech button */}
            <SpeakableText
              text={choice.text}
              characterType="hero"
              emotion="neutral"
              buttonSize="small"
              buttonPosition="left"
            >
              {choice.text}
            </SpeakableText>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * EXAMPLE 5: Battle scene with speech
 */
function BattleView({ battleState }: { battleState: BattleState }) {
  return (
    <div className="battle-view" style={{ padding: '20px' }}>
      {/* Enemy introduction */}
      <DialogueBox
        speaker={battleState.enemy.sprite}
        text={battleState.enemy.interactionText}
        characterType="enemy"
        emotion="menacing"
      />

      {/* Battle log with speech for each action */}
      <div className="battle-log" style={{ marginTop: '20px' }}>
        <h3>Battle Log</h3>
        {battleState.history.map((action, index) => (
          <div key={index} style={{ marginBottom: '8px' }}>
            <SpeakableText
              text={action.text}
              characterType={action.actor === 'player' ? 'hero' : 'enemy'}
              emotion={action.damage ? 'angry' : 'neutral'}
              buttonSize="small"
              style={{
                padding: '8px',
                backgroundColor: action.actor === 'player'
                  ? 'rgba(76, 175, 80, 0.2)'
                  : 'rgba(244, 67, 54, 0.2)',
                borderRadius: '4px',
              }}
            >
              {action.text}
            </SpeakableText>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * EXAMPLE 6: Complete game integration
 */
function CompleteGameExample() {
  const [gameState, setGameState] = React.useState<any>({
    currentRoom: {
      id: 'dungeon_1',
      description: 'A dark, musty dungeon stretches before you. Torches flicker on ancient stone walls.',
      objects: [
        {
          id: 'merchant_1',
          sprite: '🧙',
          type: 'npc',
          interactionText: 'Welcome, traveler! I have rare goods for sale.',
        },
        {
          id: 'enemy_1',
          sprite: '👹',
          type: 'enemy',
          interactionText: 'You dare enter my domain?!',
        },
      ],
    },
    battleState: null,
    sceneData: null,
  });

  return (
    <div className="game-container">
      {/* Header with voice controls */}
      <GameHeader />

      {/* Main game area */}
      <div className="game-main" style={{ padding: '20px' }}>
        {/* Room description */}
        <RoomView room={gameState.currentRoom} />

        {/* Game objects */}
        <div className="objects-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
          gap: '12px',
          marginTop: '20px',
        }}>
          {gameState.currentRoom.objects.map((obj: GameObject) => (
            <GameObjectDisplay
              key={obj.id}
              object={obj}
              onInteract={() => console.log('Interact with', obj.id)}
            />
          ))}
        </div>

        {/* Battle view */}
        {gameState.battleState && (
          <BattleView battleState={gameState.battleState} />
        )}

        {/* AI dialogue */}
        {gameState.sceneData && (
          <AIDialogueDisplay sceneData={gameState.sceneData} />
        )}
      </div>
    </div>
  );
}

/**
 * INTEGRATION CHECKLIST:
 *
 * 1. Import components at top of App.tsx:
 *    import { SpeakableText, DialogueBox, NPCInteraction } from './components/SpeakableText';
 *    import { VoiceControls } from './components/VoiceControls';
 *
 * 2. Add VoiceControls to your header/settings:
 *    <VoiceControls compact />
 *
 * 3. Wrap room descriptions with SpeakableText:
 *    <SpeakableText text={room.description} characterType="narrator">
 *      {room.description}
 *    </SpeakableText>
 *
 * 4. Replace NPC displays with NPCInteraction:
 *    <NPCInteraction npc={object} onClick={handleInteract} />
 *
 * 5. Use DialogueBox for AI responses:
 *    <DialogueBox text={sceneData.narration} characterType="narrator" />
 *
 * 6. Add speech buttons to dialogue choices:
 *    <SpeakableText text={choice.text} characterType="hero">
 *      {choice.text}
 *    </SpeakableText>
 */

function handleChoice(choice: any) {
  console.log('Selected choice:', choice);
}

export default CompleteGameExample;
