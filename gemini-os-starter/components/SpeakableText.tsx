/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { SpeechButton } from './SpeechButton';
import { CharacterArchetype, VoiceEmotion } from '../types/voice';

interface SpeakableTextProps {
  children: React.ReactNode;
  text?: string; // If different from children
  characterType?: CharacterArchetype;
  emotion?: VoiceEmotion;
  showButton?: boolean;
  buttonPosition?: 'left' | 'right';
  buttonSize?: 'small' | 'medium' | 'large';
  className?: string;
  style?: React.CSSProperties;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
}

/**
 * Text component with integrated speech button
 * Makes any text clickable to play speech
 */
export const SpeakableText: React.FC<SpeakableTextProps> = ({
  children,
  text,
  characterType = 'narrator',
  emotion,
  showButton = true,
  buttonPosition = 'left',
  buttonSize = 'small',
  className,
  style,
  onSpeechStart,
  onSpeechEnd,
}) => {
  // Extract text from children if not provided
  const speechText = text || (typeof children === 'string' ? children : '');

  if (!showButton || !speechText) {
    return <span className={className} style={style}>{children}</span>;
  }

  return (
    <span
      className={className}
      style={{
        ...styles.container,
        flexDirection: buttonPosition === 'left' ? 'row' : 'row-reverse',
        ...style,
      }}
    >
      <SpeechButton
        text={speechText}
        characterType={characterType}
        emotion={emotion}
        size={buttonSize}
        onSpeechStart={onSpeechStart}
        onSpeechEnd={onSpeechEnd}
        style={buttonPosition === 'left' ? { marginRight: '8px' } : { marginLeft: '8px' }}
      />
      <span style={styles.text}>{children}</span>
    </span>
  );
};

const styles = {
  container: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
  } as React.CSSProperties,
  text: {
    flex: 1,
  } as React.CSSProperties,
  dialogueBox: {
    padding: '12px',
    borderRadius: '8px',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    color: 'white',
    marginBottom: '8px',
  } as React.CSSProperties,
  speaker: {
    fontWeight: 'bold',
    marginBottom: '4px',
    color: '#ffd700',
  } as React.CSSProperties,
  npcContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    borderRadius: '8px',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  } as React.CSSProperties,
  npcSprite: {
    width: '64px',
    height: '64px',
    imageRendering: 'pixelated' as const,
  } as React.CSSProperties,
};

/**
 * Dialogue box with integrated speech
 */
interface DialogueBoxProps {
  speaker?: string;
  text: string;
  characterType?: CharacterArchetype;
  emotion?: VoiceEmotion;
  className?: string;
  style?: React.CSSProperties;
}

export const DialogueBox: React.FC<DialogueBoxProps> = ({
  speaker,
  text,
  characterType = 'narrator',
  emotion,
  className,
  style,
}) => {
  return (
    <div className={className} style={{ ...styles.dialogueBox, ...style }}>
      {speaker && (
        <div style={styles.speaker}>
          {speaker}
        </div>
      )}
      <SpeakableText
        text={text}
        characterType={characterType}
        emotion={emotion}
        buttonPosition="left"
        buttonSize="medium"
      >
        {text}
      </SpeakableText>
    </div>
  );
};

const dialogueBoxStyles = {
  dialogueBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    border: '2px solid #555',
    borderRadius: '8px',
    padding: '12px 16px',
    color: '#fff',
    fontFamily: 'monospace',
    fontSize: '14px',
    marginBottom: '8px',
  } as React.CSSProperties,
  speaker: {
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: '6px',
    fontSize: '12px',
  } as React.CSSProperties,
};

Object.assign(styles, dialogueBoxStyles);

/**
 * NPC Interaction component with speech
 */
interface NPCInteractionProps {
  npc: {
    sprite: string;
    type: string;
    interactionText: string;
  };
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export const NPCInteraction: React.FC<NPCInteractionProps> = ({
  npc,
  onClick,
  className,
  style,
}) => {
  const getArchetype = (type: string): CharacterArchetype => {
    const typeMap: Record<string, CharacterArchetype> = {
      npc: 'guide',
      enemy: 'enemy',
      merchant: 'merchant',
      boss: 'villain',
    };
    return typeMap[type.toLowerCase()] || 'narrator';
  };

  return (
    <div
      className={className}
      onClick={onClick}
      style={{
        ...styles.npcContainer,
        ...style,
      }}
    >
      <div style={styles.npcSprite}>{npc.sprite}</div>
      <SpeakableText
        text={npc.interactionText}
        characterType={getArchetype(npc.type)}
        buttonPosition="left"
        buttonSize="small"
      >
        {npc.interactionText}
      </SpeakableText>
    </div>
  );
};

const npcStyles = {
  npcContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  } as React.CSSProperties,
  npcSprite: {
    fontSize: '32px',
    minWidth: '32px',
  } as React.CSSProperties,
};

Object.assign(styles, npcStyles);

export default SpeakableText;
