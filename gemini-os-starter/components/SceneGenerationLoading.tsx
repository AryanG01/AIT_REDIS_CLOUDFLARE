/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
/* tslint:disable */
import React from 'react';

interface SceneGenerationLoadingProps {
  stage: 'processing' | 'generating' | 'creating_art';
  message?: string;
}

export const SceneGenerationLoading: React.FC<SceneGenerationLoadingProps> = ({
  stage,
  message,
}) => {
  const stages = [
    { id: 'processing', label: 'Processing your choice', emoji: '🎯', progress: 33 },
    { id: 'generating', label: 'Generating next scene', emoji: '📖', progress: 66 },
    { id: 'creating_art', label: 'Creating pixel art', emoji: '🎨', progress: 90 },
  ];

  const currentStage = stages.find(s => s.id === stage) || stages[0];
  const currentIndex = stages.findIndex(s => s.id === stage);

  return (
    <div
      className="w-full h-full flex items-center justify-center"
      style={{
        backgroundColor: '#2d5a4e',
        backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.1) 0px, rgba(0,0,0,0.1) 1px, transparent 1px, transparent 2px)',
        fontFamily: 'monospace'
      }}
    >
      <div className="max-w-lg w-full px-8">
        {/* Main icon */}
        <div className="text-center mb-6">
          <div className="text-8xl mb-4 animate-bounce">{currentStage.emoji}</div>
          <h2
            style={{
              color: '#f4e8d0',
              fontSize: '28px',
              fontWeight: 'bold',
              letterSpacing: '2px',
              marginBottom: '8px'
            }}
          >
            {currentStage.label}
          </h2>
          {message && (
            <p style={{ color: '#c9b896', fontSize: '14px', marginTop: '8px' }}>
              {message}
            </p>
          )}
        </div>

        {/* Progress stages */}
        <div
          className="mb-6 p-4"
          style={{
            backgroundColor: '#f4e8d0',
            border: '5px solid #3d2817',
            boxShadow: 'inset 0 3px 0 #fff9e8',
            borderRadius: '4px'
          }}
        >
          {/* Icon stages */}
          <div className="flex justify-between items-center mb-3" style={{ paddingLeft: '16px', paddingRight: '16px' }}>
            {stages.map((s, index) => {
              const isActive = index === currentIndex;
              const isCompleted = index < currentIndex;

              return (
                <React.Fragment key={s.id}>
                  <div
                    className={isActive ? 'animate-pulse' : ''}
                    style={{
                      width: '32px',
                      height: '32px',
                      backgroundColor: isCompleted ? '#6fa85c' : isActive ? '#d4a574' : '#8b6f47',
                      border: '3px solid #3d2817',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '16px',
                      flexShrink: 0
                    }}
                  >
                    {isCompleted ? '✓' : s.emoji}
                  </div>
                  {index < stages.length - 1 && (
                    <div
                      style={{
                        flex: 1,
                        height: '4px',
                        backgroundColor: isCompleted ? '#6fa85c' : '#8b6f47',
                        marginLeft: '8px',
                        marginRight: '8px'
                      }}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* Progress bar */}
          <div style={{ paddingLeft: '16px', paddingRight: '16px' }}>
            <div
              style={{
                width: '100%',
                height: '20px',
                backgroundColor: '#8b6f47',
                border: '3px solid #3d2817',
                borderRadius: '4px',
                overflow: 'hidden',
                boxShadow: 'inset 2px 2px 0 rgba(0,0,0,0.2)'
              }}
            >
              <div
                className="h-full transition-all duration-500"
                style={{
                  width: `${currentStage.progress}%`,
                  backgroundColor: '#6fa85c',
                  boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.2)'
                }}
              ></div>
            </div>
          </div>
        </div>

        {/* Info */}
        <div
          className="text-center p-3"
          style={{
            backgroundColor: '#c9b896',
            border: '4px solid #8b6f47',
            borderRadius: '4px',
            boxShadow: 'inset 0 2px 0 #e8d4b0'
          }}
        >
          <p style={{ color: '#5c3d2e', fontSize: '12px', fontStyle: 'italic' }}>
            ⏱ This may take 5-15 seconds...
          </p>
        </div>
      </div>
    </div>
  );
};
