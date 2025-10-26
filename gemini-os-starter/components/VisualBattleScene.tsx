/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
/* tslint:disable */
import React, {useState, useEffect} from 'react';
import {generateBattleScene, GeneratedImage} from '../services/falService';
import {getCachedImage, cacheImage} from '../utils/imageCache';
import {composeInteractionScene} from '../services/sceneComposer';
import {SceneGenerationLoading} from './SceneGenerationLoading';
import {speechService} from '../services/speechService';

export interface BattleSceneData {
  scene: string;
  imagePrompts: {
    background: string;
    enemy: string;
    character?: string;
  };
  choices: Array<{
    id: string;
    text: string;
    type: string;
    value?: number;
  }>;
  characterSprite?: string;
  enemySprite?: string;
  biome?: string;
  interactionContext?: string;
  referenceImageUrl?: string;
}

interface VisualBattleSceneProps {
  sceneData: BattleSceneData | null;
  onChoice: (choiceId: string, choiceType: string, value?: number) => void;
  isLoading: boolean;
  characterClass?: string;
  characterSprite?: string;
  onSceneGenerated?: (imageUrl: string) => void;
  autoPlaySpeech?: boolean;
}

export const VisualBattleScene: React.FC<VisualBattleSceneProps> = ({
  sceneData,
  onChoice,
  isLoading,
  characterClass,
  characterSprite,
  onSceneGenerated,
  autoPlaySpeech = true,
}) => {
  const [images, setImages] = useState<{
    background?: string;
    enemy?: string;
    character?: string;
  }>({});
  const [generatingImages, setGeneratingImages] = useState(false);
  const [showLoadingScreen, setShowLoadingScreen] = useState(false);
  const [previousSceneData, setPreviousSceneData] = useState<BattleSceneData | null>(null);
  const [speechPlayed, setSpeechPlayed] = useState(false);

  // Store previous scene data when we have valid data and reset speech state
  useEffect(() => {
    if (sceneData) {
      setPreviousSceneData(sceneData);
      setSpeechPlayed(false); // Reset for new scene
    }
  }, [sceneData]);

  // Generate or load cached images when scene data changes
  useEffect(() => {
    console.log('[VisualBattleScene] useEffect triggered. Scene data:', sceneData);

    if (!sceneData) {
      return;
    }

    const hasImagePrompts = sceneData.imagePrompts?.background && sceneData.imagePrompts?.enemy;
    const hasSprites = sceneData.characterSprite && sceneData.enemySprite && sceneData.biome;

    if (!hasImagePrompts && !hasSprites) {
      console.log('[VisualBattleScene] No image prompts or sprites available.');
      return;
    }

    const loadImages = async () => {
      console.log('[VisualBattleScene] loadImages started.');
      setGeneratingImages(true);

      try {
        if (hasSprites) {
          console.log('[VisualBattleScene] Composing scene with sprites...');
          console.log('[VisualBattleScene] Scene context:', sceneData.interactionContext);
          
          const sceneContext = sceneData.interactionContext || 'meeting';
          const contextHash = sceneContext.split('').reduce((acc, char) => {
            return ((acc << 5) - acc) + char.charCodeAt(0);
          }, 0).toString(36);
          const cacheKey = `composed_${sceneData.characterSprite}_${sceneData.enemySprite}_${contextHash}`;
          const cachedComposed = getCachedImage(cacheKey);
          
          if (cachedComposed) {
            console.log('[VisualBattleScene] Found cached composed scene');
            setImages({
              background: cachedComposed,
            });
            setGeneratingImages(false);
            return;
          }

          const composedScene = await composeInteractionScene(
            sceneData.characterSprite!,
            sceneData.enemySprite!,
            sceneData.biome!,
            sceneContext,
            sceneData.referenceImageUrl
          );

          console.log('[VisualBattleScene] Scene composed successfully');
          cacheImage(cacheKey, composedScene.url);

          setImages({
            background: composedScene.url,
          });

          if (onSceneGenerated && !sceneData.referenceImageUrl) {
            onSceneGenerated(composedScene.url);
          }
        } else if (hasImagePrompts) {
          console.log('[VisualBattleScene] Checking for cached images...');
          const backgroundPrompt = sceneData.imagePrompts.background;
          const enemyPrompt = sceneData.imagePrompts.enemy;

          const cachedBg = getCachedImage(backgroundPrompt);
          const cachedEnemy = getCachedImage(enemyPrompt);

          if (cachedBg && cachedEnemy) {
            console.log('[VisualBattleScene] Found cached images. Using them.', { background: cachedBg, enemy: cachedEnemy });
            setImages({
              background: cachedBg,
              enemy: cachedEnemy,
            });
            setGeneratingImages(false);
            return;
          }

          console.log('[VisualBattleScene] No cached images found. Generating...');
          const result = await generateBattleScene({
            backgroundPrompt: backgroundPrompt,
            enemyPrompt: enemyPrompt,
            characterPrompt: sceneData.imagePrompts.character,
          });

          console.log('[VisualBattleScene] Image generation result:', result);

          if (!result || !result.background || !result.enemy) {
              console.error('[VisualBattleScene] Image generation failed to return expected results.');
              throw new Error('Image generation failed.');
          }

          cacheImage(backgroundPrompt, result.background.url);
          cacheImage(enemyPrompt, result.enemy.url);
          if (result.character && sceneData.imagePrompts.character) {
            cacheImage(sceneData.imagePrompts.character, result.character.url);
          }

          setImages({
            background: result.background.url,
            enemy: result.enemy.url,
            character: result.character?.url,
          });
        }
      } catch (error) {
        console.error('[VisualBattleScene] Failed to generate or load battle scene images:', error);
      } finally {
        console.log('[VisualBattleScene] loadImages finished.');
        setGeneratingImages(false);
      }
    };

    loadImages();
  }, [sceneData, autoPlaySpeech, speechPlayed]);

  // Play speech AFTER rendering completes (separate from image loading)
  useEffect(() => {
    if (!generatingImages && sceneData?.scene && autoPlaySpeech && !speechPlayed && images.background) {
      // Wait for React to finish rendering the new scene
      // Use multiple animation frames to ensure DOM is fully updated and painted
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(() => {
            console.log('[VisualBattleScene] Playing speech after render complete');
            speechService.stopSpeech();
            speechService.speak(sceneData.scene, 'narrator', 'neutral', true);
            setSpeechPlayed(true);
          }, 500); // Extra 500ms delay to ensure screen is fully visible
        });
      });
    }
  }, [generatingImages, sceneData?.scene, autoPlaySpeech, speechPlayed, images.background]);

  // Delay showing loading screen to allow animation overlay to complete
  useEffect(() => {
    if (isLoading && !sceneData) {
      // Wait 2.3 seconds for animation to complete (2s animation + 300ms fade)
      const timer = setTimeout(() => {
        setShowLoadingScreen(true);
      }, 2300);

      return () => clearTimeout(timer);
    } else if (!isLoading) {
      setShowLoadingScreen(false);
    }
  }, [isLoading, sceneData]);

  // Determine loading stage
  // Show loading ONLY if: (no sceneData AND delay passed) OR images are still generating
  if (generatingImages || ((!sceneData) && showLoadingScreen)) {
    let stage: 'processing' | 'generating' | 'creating_art' = 'generating';

    if (generatingImages) {
      stage = 'creating_art';
    } else if (showLoadingScreen || isLoading) {
      stage = 'generating';
    }

    console.log('[VisualBattleScene] Showing loading screen, stage:', stage, 'isLoading:', isLoading, 'generatingImages:', generatingImages);
    return <SceneGenerationLoading stage={stage} />;
  }

  // If no sceneData but delay hasn't passed yet, show previous scene (frozen, no buttons)
  if (!sceneData && !showLoadingScreen && previousSceneData) {
    return (
      <div
        className="w-full h-full flex flex-col overflow-hidden"
        style={{
          backgroundColor: '#1a1a1a',
          fontFamily: 'monospace'
        }}
      >
        {/* Battle Scene Display */}
        <div className="flex-1 relative flex items-center justify-center overflow-hidden">
          {/* Background Image */}
          {images.background && (
            <img
              src={images.background}
              alt="Battle background"
              className="absolute inset-0 w-full h-full object-cover"
              style={{imageRendering: 'pixelated'}}
            />
          )}

          {/* Dark overlay for readability */}
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, transparent 50%, rgba(0,0,0,0.6) 100%)'
            }}
          ></div>
        </div>

        {/* Story Text - Bottom Panel (no choices, just scene) */}
        <div
          className="p-3 md:p-4 lg:p-5 overflow-y-auto"
          style={{
            background: 'linear-gradient(to top, #1a1a1a 0%, rgba(26,26,26,0.95) 80%, transparent 100%)',
            borderTop: '4px solid #5c3d2e',
            maxHeight: '40vh'
          }}
        >
          {/* Scene Description */}
          <div className="max-w-4xl mx-auto">
            <div
              className="p-3 md:p-4"
              style={{
                backgroundColor: 'rgba(61,40,23,0.95)',
                border: '3px solid #3d2817',
                borderRadius: '4px',
                boxShadow: '0 4px 0 #3d2817, inset 0 3px 0 rgba(255,255,255,0.1)'
              }}
            >
              <p
                className="text-sm md:text-base lg:text-lg"
                style={{
                  color: '#f4e8d0',
                  lineHeight: '1.6',
                  textAlign: 'center',
                  fontWeight: '500'
                }}
              >
                {previousSceneData.scene}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Final safety check
  if (!sceneData) {
    return null;
  }
  return (
    <div
      className="w-full h-full flex flex-col overflow-hidden"
      style={{
        backgroundColor: '#1a1a1a',
        fontFamily: 'monospace'
      }}
    >
      {/* Battle Scene Display */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {/* Background Image */}
        {images.background && (
          <img
            src={images.background}
            alt="Battle background"
            className="absolute inset-0 w-full h-full object-cover"
            style={{imageRendering: 'pixelated'}}
          />
        )}

        {/* Dark overlay for readability */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, transparent 50%, rgba(0,0,0,0.6) 100%)'
          }}
        ></div>
      </div>

      {/* Story Text & Choices - Bottom Panel */}
      <div
        className="p-3 md:p-4 lg:p-5 overflow-y-auto"
        style={{
          background: 'linear-gradient(to top, #1a1a1a 0%, rgba(26,26,26,0.95) 80%, transparent 100%)',
          borderTop: '4px solid #5c3d2e',
          maxHeight: '40vh'
        }}
      >
        {/* Scene Description */}
        <div className="max-w-4xl mx-auto mb-2 md:mb-3">
          <div className="bg-black/70 backdrop-blur-md rounded-xl p-3 md:p-4 border-2 border-purple-500/50">
            <div className="text-gray-100 text-sm md:text-base lg:text-lg leading-relaxed text-center font-medium">
              {sceneData.scene}
            </div>
          </div>
        </div>

        {/* Action Choices */}
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-wrap justify-center gap-3 md:gap-4">
            {sceneData.choices.map((choice) => {
              const getButtonStyle = () => {
                switch (choice.type) {
                  case 'conclude':
                    return {
                      backgroundColor: '#7b1fa2',
                      borderColor: '#4a0e4e',
                      shadowColor: '#4a0e4e'
                    };
                  case 'combat':
                  case 'damage':
                    return {
                      backgroundColor: '#c9534f',
                      borderColor: '#8b3a34',
                      shadowColor: '#8b3a34'
                    };
                  case 'dialogue':
                    return {
                      backgroundColor: '#5a8fc9',
                      borderColor: '#3d5f82',
                      shadowColor: '#3d5f82'
                    };
                  case 'heal':
                    return {
                      backgroundColor: '#6fa85c',
                      borderColor: '#4a7a3d',
                      shadowColor: '#4a7a3d'
                    };
                  default:
                    return {
                      backgroundColor: '#8b6f47',
                      borderColor: '#5c3d2e',
                      shadowColor: '#5c3d2e'
                    };
                }
              };

              const buttonStyle = getButtonStyle();

              return (
                <button
                  key={choice.id}
                  onClick={() => onChoice(choice.id, choice.type, choice.value)}
                  className="transition-all active:translate-y-1 text-xs md:text-sm"
                  style={{
                    backgroundColor: buttonStyle.backgroundColor,
                    border: `3px solid ${buttonStyle.borderColor}`,
                    borderRadius: '4px',
                    boxShadow: `0 4px 0 ${buttonStyle.shadowColor}`,
                    color: '#f4e8d0',
                    fontWeight: 'bold',
                    letterSpacing: '0.5px',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    minWidth: '120px'
                  }}
                  disabled={generatingImages}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = `0 6px 0 ${buttonStyle.shadowColor}`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = `0 4px 0 ${buttonStyle.shadowColor}`;
                  }}
                >
                  <div className="flex items-center justify-center">
                    {choice.text}
                  </div>
                  { (choice.type === 'damage' || choice.type === 'combat' || choice.type === 'heal') && choice.value !== undefined && (
                    <span style={{
                      display: 'block',
                      fontSize: '11px',
                      marginTop: '4px',
                      opacity: 0.9,
                      color: '#e8d4b0'
                    }}>
                      {choice.type === 'damage' || choice.type === 'combat'
                        ? `${choice.value} damage`
                        : `+${choice.value} HP`}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper function to get character emoji based on class
function getCharacterEmoji(characterClass: string): string {
  const classMap: Record<string, string> = {
    Warrior: '⚔️',
    Mage: '🔮',
    Thief: '🗡️',
    Cleric: '✝️',
    Ranger: '🏹',
  };
  return classMap[characterClass] || '🧙';
}
