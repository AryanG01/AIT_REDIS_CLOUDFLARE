/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
/* tslint:disable */
import React, { useState } from 'react';
import { StoryMode } from '../types';

interface StoryInputProps {
  onSubmit: (story: string | null, mode: StoryMode) => void;
  hasExistingSession?: boolean;
  onRestoreSession?: () => void;
  isRestoringSession?: boolean;
}

export const StoryInput: React.FC<StoryInputProps> = ({
  onSubmit,
  hasExistingSession = false,
  onRestoreSession,
  isRestoringSession = false
}) => {
  const [storyText, setStoryText] = useState('');
  const [selectedMode, setSelectedMode] = useState<StoryMode>('inspiration');
  const [showModeSelect, setShowModeSelect] = useState(false);

  const handleNext = () => {
    if (storyText.trim()) {
      setShowModeSelect(true);
    }
  };

  const handleBack = () => {
    setShowModeSelect(false);
  };

  const handleSubmit = () => {
    onSubmit(storyText.trim(), selectedMode);
  };

  const handleSkip = () => {
    onSubmit(null, 'inspiration');
  };

  // Step 2: Mode Selection Screen
  if (showModeSelect) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-full p-6"
        style={{
          backgroundColor: '#2d5a4e',
          backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.1) 0px, rgba(0,0,0,0.1) 1px, transparent 1px, transparent 2px)',
          fontFamily: 'monospace'
        }}
      >
        <div className="max-w-4xl w-full">
          {/* Title */}
          <div
            className="mb-6 p-8 text-center relative"
            style={{
              backgroundColor: '#f4e8d0',
              border: '8px solid #3d2817',
              boxShadow: '0 10px 0 #3d2817, inset 0 6px 0 #fff9e8',
              borderRadius: '4px'
            }}
          >
            <div style={{ position: 'absolute', top: '10px', left: '10px', width: '20px', height: '20px', borderTop: '4px solid #8b6f47', borderLeft: '4px solid #8b6f47' }}></div>
            <div style={{ position: 'absolute', top: '10px', right: '10px', width: '20px', height: '20px', borderTop: '4px solid #8b6f47', borderRight: '4px solid #8b6f47' }}></div>
            <div style={{ position: 'absolute', bottom: '10px', left: '10px', width: '20px', height: '20px', borderBottom: '4px solid #8b6f47', borderLeft: '4px solid #8b6f47' }}></div>
            <div style={{ position: 'absolute', bottom: '10px', right: '10px', width: '20px', height: '20px', borderBottom: '4px solid #8b6f47', borderRight: '4px solid #8b6f47' }}></div>

            <div style={{ fontSize: '14px', color: '#8b6f47', marginBottom: '8px' }}>✦ ✦ ✦</div>
            <h1
              style={{
                color: '#5c3d2e',
                textShadow: '4px 4px 0px #d4a574',
                letterSpacing: '3px',
                fontSize: '42px',
                fontWeight: 'bold',
                marginBottom: '8px'
              }}
            >
              SELECT MODE
            </h1>
            <div className="flex items-center justify-center gap-3 mt-2">
              <div style={{ width: '60px', height: '4px', backgroundColor: '#8b6f47', borderRadius: '2px' }}></div>
              <span style={{ color: '#8b6f47', fontSize: '18px' }}>★</span>
              <div style={{ width: '60px', height: '4px', backgroundColor: '#8b6f47', borderRadius: '2px' }}></div>
            </div>
          </div>

          {/* Info */}
          <div
            className="mb-6 p-5"
            style={{
              backgroundColor: '#c9b896',
              border: '5px solid #8b6f47',
              boxShadow: 'inset 0 3px 0 #e8d4b0',
              borderRadius: '4px'
            }}
          >
            <p style={{ color: '#3d2817', fontSize: '14px', lineHeight: '1.8', textAlign: 'center', fontWeight: '500' }}>
              ⚙️ Choose how the AI should use your story
            </p>
          </div>

          {/* Mode Options */}
          <div className="space-y-4 mb-6">
            <button
              onClick={() => setSelectedMode('recreation')}
              className="w-full text-left p-6 transition-all"
              style={{
                backgroundColor: selectedMode === 'recreation' ? '#d4a574' : '#c9b896',
                border: `5px solid ${selectedMode === 'recreation' ? '#8b6f47' : '#a89176'}`,
                borderRadius: '6px',
                boxShadow: selectedMode === 'recreation' ? 'inset 0 -4px 0 #b8915f, 0 0 0 4px #f4e8d0' : '0 4px 0 #a89176',
                cursor: 'pointer'
              }}
            >
              <div className="flex items-start gap-4">
                <span style={{ color: '#5c3d2e', fontSize: '24px', fontWeight: 'bold', marginTop: '4px' }}>
                  {selectedMode === 'recreation' ? '▶' : '▷'}
                </span>
                <div className="flex-1">
                  <div style={{ color: '#3d2817', fontSize: '18px', fontWeight: 'bold', marginBottom: '8px', letterSpacing: '1px' }}>
                    🎭 STORY RECREATION
                  </div>
                  <div style={{ color: '#5c3d2e', fontSize: '14px', lineHeight: '1.7' }}>
                    Play through the actual story plot. Meet real characters, recreate key scenes.
                    You can even play AS a character from the story!
                  </div>
                </div>
              </div>
            </button>

            <button
              onClick={() => setSelectedMode('continuation')}
              className="w-full text-left p-6 transition-all"
              style={{
                backgroundColor: selectedMode === 'continuation' ? '#d4a574' : '#c9b896',
                border: `5px solid ${selectedMode === 'continuation' ? '#8b6f47' : '#a89176'}`,
                borderRadius: '6px',
                boxShadow: selectedMode === 'continuation' ? 'inset 0 -4px 0 #b8915f, 0 0 0 4px #f4e8d0' : '0 4px 0 #a89176',
                cursor: 'pointer'
              }}
            >
              <div className="flex items-start gap-4">
                <span style={{ color: '#5c3d2e', fontSize: '24px', fontWeight: 'bold', marginTop: '4px' }}>
                  {selectedMode === 'continuation' ? '▶' : '▷'}
                </span>
                <div className="flex-1">
                  <div style={{ color: '#3d2817', fontSize: '18px', fontWeight: 'bold', marginBottom: '8px', letterSpacing: '1px' }}>
                    📖 STORY CONTINUATION
                  </div>
                  <div style={{ color: '#5c3d2e', fontSize: '14px', lineHeight: '1.7' }}>
                    Play after the story ends. References events and characters from canon.
                    New adventures in an established world.
                  </div>
                </div>
              </div>
            </button>

            <button
              onClick={() => setSelectedMode('inspiration')}
              className="w-full text-left p-6 transition-all"
              style={{
                backgroundColor: selectedMode === 'inspiration' ? '#d4a574' : '#c9b896',
                border: `5px solid ${selectedMode === 'inspiration' ? '#8b6f47' : '#a89176'}`,
                borderRadius: '6px',
                boxShadow: selectedMode === 'inspiration' ? 'inset 0 -4px 0 #b8915f, 0 0 0 4px #f4e8d0' : '0 4px 0 #a89176',
                cursor: 'pointer'
              }}
            >
              <div className="flex items-start gap-4">
                <span style={{ color: '#5c3d2e', fontSize: '24px', fontWeight: 'bold', marginTop: '4px' }}>
                  {selectedMode === 'inspiration' ? '▶' : '▷'}
                </span>
                <div className="flex-1">
                  <div style={{ color: '#3d2817', fontSize: '18px', fontWeight: 'bold', marginBottom: '8px', letterSpacing: '1px' }}>
                    ✨ THEMATIC INSPIRATION
                  </div>
                  <div style={{ color: '#5c3d2e', fontSize: '14px', lineHeight: '1.7' }}>
                    Use the story's world, tone, and atmosphere. Creates original adventures
                    that FEEL like the source material.
                  </div>
                </div>
              </div>
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-5">
            <button
              onClick={handleBack}
              className="flex-1 py-5 transition-all active:translate-y-2"
              style={{
                backgroundColor: '#8b7355',
                border: '5px solid #5c3d2e',
                borderRadius: '6px',
                boxShadow: '0 8px 0 #5c3d2e',
                color: '#f4e8d0',
                fontSize: '16px',
                fontWeight: 'bold',
                letterSpacing: '2px',
                cursor: 'pointer'
              }}
            >
              ← BACK
            </button>

            <button
              onClick={handleSubmit}
              className="flex-1 py-5 transition-all active:translate-y-2"
              style={{
                backgroundColor: '#6fa85c',
                border: '5px solid #4a7039',
                borderRadius: '6px',
                boxShadow: '0 8px 0 #4a7039',
                color: '#f4e8d0',
                fontSize: '16px',
                fontWeight: 'bold',
                letterSpacing: '2px',
                cursor: 'pointer'
              }}
            >
              ⚔ START ⚔
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 1: Story Input Screen
  return (
    <div
      className="flex flex-col items-center justify-center min-h-full p-6"
      style={{
        backgroundColor: '#2d5a4e',
        backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.1) 0px, rgba(0,0,0,0.1) 1px, transparent 1px, transparent 2px)',
        fontFamily: 'monospace'
      }}
    >
      <div className="max-w-4xl w-full">
        {/* Main Title Box */}
        <div
          className="mb-6 p-8 text-center relative"
          style={{
            backgroundColor: '#f4e8d0',
            border: '8px solid #3d2817',
            boxShadow: '0 10px 0 #3d2817, inset 0 6px 0 #fff9e8',
            borderRadius: '4px'
          }}
        >
          {/* Corner decorations */}
          <div style={{ position: 'absolute', top: '10px', left: '10px', width: '20px', height: '20px', borderTop: '4px solid #8b6f47', borderLeft: '4px solid #8b6f47' }}></div>
          <div style={{ position: 'absolute', top: '10px', right: '10px', width: '20px', height: '20px', borderTop: '4px solid #8b6f47', borderRight: '4px solid #8b6f47' }}></div>
          <div style={{ position: 'absolute', bottom: '10px', left: '10px', width: '20px', height: '20px', borderBottom: '4px solid #8b6f47', borderLeft: '4px solid #8b6f47' }}></div>
          <div style={{ position: 'absolute', bottom: '10px', right: '10px', width: '20px', height: '20px', borderBottom: '4px solid #8b6f47', borderRight: '4px solid #8b6f47' }}></div>

          <div style={{ fontSize: '14px', color: '#8b6f47', marginBottom: '8px' }}>✦ ✦ ✦</div>
          <h1
            style={{
              color: '#5c3d2e',
              textShadow: '4px 4px 0px #d4a574',
              letterSpacing: '3px',
              fontSize: '42px',
              fontWeight: 'bold',
              marginBottom: '8px'
            }}
          >
            STORY MODE
          </h1>
          <div className="flex items-center justify-center gap-3 mt-2">
            <div style={{ width: '60px', height: '4px', backgroundColor: '#8b6f47', borderRadius: '2px' }}></div>
            <span style={{ color: '#8b6f47', fontSize: '18px' }}>★</span>
            <div style={{ width: '60px', height: '4px', backgroundColor: '#8b6f47', borderRadius: '2px' }}></div>
          </div>
        </div>

        {/* Info Box */}
        <div
          className="mb-6 p-5"
          style={{
            backgroundColor: '#c9b896',
            border: '5px solid #8b6f47',
            boxShadow: 'inset 0 3px 0 #e8d4b0',
            borderRadius: '4px'
          }}
        >
          <p style={{ color: '#3d2817', fontSize: '14px', lineHeight: '1.8', textAlign: 'center', fontWeight: '500' }}>
            📖 Enter a story to shape your adventure!<br/>
            The AI will create a world based on your tale.
          </p>
        </div>

        {/* Continue Game Button (if session exists) */}
        {hasExistingSession && onRestoreSession && (
          <button
            onClick={onRestoreSession}
            disabled={isRestoringSession}
            className="w-full mb-6 py-6 transition-all active:translate-y-2"
            style={{
              backgroundColor: isRestoringSession ? '#888' : '#5c8fb8',
              border: `5px solid ${isRestoringSession ? '#555' : '#3d6487'}`,
              borderRadius: '6px',
              boxShadow: isRestoringSession ? '0 4px 0 #555' : '0 8px 0 #3d6487',
              color: '#f4e8d0',
              fontSize: '18px',
              fontWeight: 'bold',
              letterSpacing: '2px',
              cursor: isRestoringSession ? 'not-allowed' : 'pointer',
              opacity: isRestoringSession ? 0.7 : 1
            }}
          >
            {isRestoringSession ? (
              <span>🔄 RESTORING SESSION...</span>
            ) : (
              <span>💾 CONTINUE GAME</span>
            )}
          </button>
        )}

        {/* Story Input Box */}
        <div
          className="mb-6 p-6"
          style={{
            backgroundColor: '#f4e8d0',
            border: '6px solid #3d2817',
            boxShadow: 'inset 0 4px 0 #fff9e8',
            borderRadius: '4px'
          }}
        >
          <div className="mb-4">
            <div
              className="inline-block px-4 py-2"
              style={{
                backgroundColor: '#5c3d2e',
                color: '#f4e8d0',
                fontSize: '13px',
                fontWeight: 'bold',
                border: '3px solid #3d2817',
                borderRadius: '4px',
                letterSpacing: '1px'
              }}
            >
              ✍ YOUR STORY
            </div>
          </div>

          <textarea
            value={storyText}
            onChange={(e) => setStoryText(e.target.value)}
            placeholder="Type your story here...

Example:
Inside the headquarters of Horizon Labs, a product lead must rescue a failing launch minutes before investors arrive, coordinating teammates across departments while the clock keeps ticking..."
            className="w-full h-64 p-4"
            style={{
              backgroundColor: '#fff9e8',
              border: '4px solid #8b6f47',
              borderRadius: '4px',
              color: '#3d2817',
              fontSize: '14px',
              lineHeight: '1.7',
              fontFamily: 'monospace',
              resize: 'none',
              boxShadow: 'inset 3px 3px 0 rgba(0,0,0,0.1)'
            }}
            maxLength={5000}
          />
          <div
            className="text-right mt-2"
            style={{
              color: '#8b6f47',
              fontSize: '12px',
              fontWeight: 'bold'
            }}
          >
            {storyText.length}/5000 characters
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-5">
          <button
            onClick={handleSkip}
            className="flex-1 py-5 transition-all active:translate-y-2"
            style={{
              backgroundColor: '#8b7355',
              border: '5px solid #5c3d2e',
              borderRadius: '6px',
              boxShadow: '0 8px 0 #5c3d2e',
              color: '#f4e8d0',
              fontSize: '16px',
              fontWeight: 'bold',
              letterSpacing: '2px',
              cursor: 'pointer'
            }}
          >
            SKIP
          </button>

          <button
            onClick={handleNext}
            disabled={!storyText.trim()}
            className="flex-1 py-5 transition-all active:translate-y-2"
            style={{
              backgroundColor: storyText.trim() ? '#6fa85c' : '#666',
              border: `5px solid ${storyText.trim() ? '#4a7039' : '#444'}`,
              borderRadius: '6px',
              boxShadow: `0 8px 0 ${storyText.trim() ? '#4a7039' : '#444'}`,
              color: '#f4e8d0',
              fontSize: '16px',
              fontWeight: 'bold',
              letterSpacing: '2px',
              cursor: storyText.trim() ? 'pointer' : 'not-allowed',
              opacity: storyText.trim() ? 1 : 0.6
            }}
          >
            NEXT →
          </button>
        </div>
      </div>
    </div>
  );
};
