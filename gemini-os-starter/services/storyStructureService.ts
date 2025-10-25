/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
/* tslint:disable */
import {geminiProxyGenerate, GEMINI_MODELS, isApiKeyConfigured} from './geminiProxyClient';

export interface StoryBeat {
  roomNumber: number;
  title: string;
  description: string;
  keyCharacters: string[];
  objective: string;
  location: string;
  expectedOutcome: string;
}

export interface StoryStructure {
  storyTitle: string;
  storySummary: string;
  mainCharacters: Array<{
    name: string;
    role: string;
    description: string;
  }>;
  storyBeats: StoryBeat[];
  themes: string[];
  setting: string;
}

const STORY_ANALYSIS_PROMPT = (storyContext: string) => `
You are a narrative analyst for a 5-room story recreation game. Analyze the following story and break it down into a structured format.

**STORY:**
${storyContext}

**YOUR TASK:**
Extract the story structure and break it into EXACTLY 5 key moments/beats that can be experienced as game rooms.

**RESPONSE FORMAT: JSON ONLY**
Return a single valid JSON object (no markdown, no comments):

{
  "storyTitle": "(string) Title of the story",
  "storySummary": "(string) 2-3 sentence summary",
  "mainCharacters": [
    {
      "name": "(string) Character's name",
      "role": "(string) Their role (protagonist, antagonist, mentor, rival, ally, etc.)",
      "description": "(string) Brief description (1 sentence)"
    }
  ],
  "storyBeats": [
    {
      "roomNumber": 0,
      "title": "(string) Beat title (e.g., 'The Beginning', 'First Challenge')",
      "description": "(string) What happens in this story beat (2-3 sentences)",
      "keyCharacters": ["(string) Names of characters involved"],
      "objective": "(string) What the player/protagonist must do",
      "location": "(string) Where this takes place",
      "expectedOutcome": "(string) What should happen if successful"
    }
  ],
  "themes": ["(string) Major themes in the story"],
  "setting": "(string) Overall setting/world (e.g., 'Modern football world', 'Medieval fantasy kingdom')"
}

**CRITICAL REQUIREMENTS:**
1. Extract EXACTLY 5 story beats (rooms 0-4)
2. Story beats should follow the narrative arc:
   - Beat 0: Opening/Setup (introduce protagonist, establish normal world)
   - Beat 1: Inciting Incident (first major challenge/conflict)
   - Beat 2: Rising Action (complications, character development)
   - Beat 3: Climax (highest tension, major confrontation)
   - Beat 4: Resolution (conclusion, aftermath)
3. Each beat MUST include specific characters from the story
4. Objectives should be actionable in a game context
5. Locations should be specific places mentioned or implied in the story

**EXAMPLES:**

For "Messi winning the World Cup":
{
  "storyTitle": "The Road to Glory",
  "storySummary": "Lionel Messi's journey to finally win the FIFA World Cup with Argentina, overcoming doubt and adversity.",
  "mainCharacters": [
    {
      "name": "Lionel Messi",
      "role": "protagonist",
      "description": "Argentina's captain seeking his first World Cup victory"
    },
    {
      "name": "Lionel Scaloni",
      "role": "mentor",
      "description": "Argentina's head coach who believes in the team"
    },
    {
      "name": "Kylian Mbappé",
      "role": "rival",
      "description": "France's star striker and Messi's final challenge"
    }
  ],
  "storyBeats": [
    {
      "roomNumber": 0,
      "title": "The Last Chance",
      "description": "Messi arrives at Qatar 2022, knowing this is likely his final World Cup. The pressure is immense, but hope remains. He must prove he can lead Argentina to glory.",
      "keyCharacters": ["Lionel Messi", "Lionel Scaloni", "Teammates"],
      "objective": "Meet with the coach and teammates, prepare mentally for the tournament",
      "location": "Argentina team training facility in Qatar",
      "expectedOutcome": "Team unity established, Messi commits to giving everything"
    },
    {
      "roomNumber": 1,
      "title": "The Shocking Defeat",
      "description": "Argentina faces Saudi Arabia in their opening match and loses 2-1 in a stunning upset. Messi must rally the team after this devastating blow.",
      "keyCharacters": ["Lionel Messi", "Teammates", "Critics"],
      "objective": "Overcome doubt and criticism, motivate the team to continue",
      "location": "Stadium locker room after Saudi Arabia match",
      "expectedOutcome": "Team finds renewed determination despite the loss"
    },
    {
      "roomNumber": 2,
      "title": "The Comeback Path",
      "description": "Argentina battles through the group stage and knockout rounds. Messi delivers crucial performances, silencing doubters with each victory.",
      "keyCharacters": ["Lionel Messi", "Netherlands defenders", "Opponents"],
      "objective": "Win critical matches and advance through the tournament",
      "location": "Various World Cup stadiums",
      "expectedOutcome": "Argentina reaches the final against France"
    },
    {
      "roomNumber": 3,
      "title": "The Ultimate Test",
      "description": "The World Cup Final. Argentina vs France. Messi vs Mbappé. The match goes to penalties after an intense 3-3 draw. Everything comes down to this moment.",
      "keyCharacters": ["Lionel Messi", "Kylian Mbappé", "Argentina teammates"],
      "objective": "Lead Argentina to victory in the final, take the crucial penalty",
      "location": "Lusail Stadium, World Cup Final",
      "expectedOutcome": "Win the penalty shootout and claim the World Cup"
    },
    {
      "roomNumber": 4,
      "title": "The Dream Realized",
      "description": "Argentina has won! Messi lifts the World Cup trophy, finally completing his legacy. The celebration with teammates and fans is unforgettable.",
      "keyCharacters": ["Lionel Messi", "Teammates", "Fans", "Family"],
      "objective": "Celebrate the victory and reflect on the journey",
      "location": "Lusail Stadium podium and celebration area",
      "expectedOutcome": "Legacy cemented, emotional conclusion to the story"
    }
  ],
  "themes": ["perseverance", "redemption", "legacy", "teamwork"],
  "setting": "Modern football world, 2022 FIFA World Cup in Qatar"
}

Now analyze the provided story and return the JSON structure.
`;

/**
 * Analyze a story and extract its structure for recreation mode
 */
export async function analyzeStoryStructure(storyContext: string): Promise<StoryStructure> {
  if (!isApiKeyConfigured()) {
    throw new Error('API_KEY not configured');
  }

  console.log('[StoryStructure] Analyzing story structure for recreation mode...');

  const model = GEMINI_MODELS.FLASH_EXP;

  try {
    // Call Gemini API through secure proxy
    const text = await geminiProxyGenerate(model, STORY_ANALYSIS_PROMPT(storyContext));
    let jsonText = text.trim();
    console.log('[StoryStructure] Raw response:', jsonText.substring(0, 300));

    // Remove markdown code blocks if present
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```json?\s*/i, '').replace(/```\s*$/, '');
    }

    const structure: StoryStructure = JSON.parse(jsonText);

    // Validate structure
    if (!structure.storyBeats || structure.storyBeats.length !== 5) {
      throw new Error(`Expected 5 story beats, got ${structure.storyBeats?.length || 0}`);
    }

    // Ensure beat numbers are correct (0-4)
    structure.storyBeats.forEach((beat, index) => {
      beat.roomNumber = index;
    });

    console.log('[StoryStructure] ✅ Story structure analyzed successfully');
    console.log(`  - Title: ${structure.storyTitle}`);
    console.log(`  - Main Characters: ${structure.mainCharacters.map(c => c.name).join(', ')}`);
    console.log(`  - Story Beats: ${structure.storyBeats.map(b => b.title).join(' → ')}`);

    return structure;
  } catch (error) {
    console.error('[StoryStructure] Failed to analyze story:', error);
    throw error;
  }
}

/**
 * Get a specific story beat by room number
 */
export function getStoryBeat(structure: StoryStructure, roomNumber: number): StoryBeat | null {
  return structure.storyBeats.find(beat => beat.roomNumber === roomNumber) || null;
}

/**
 * Check if a story beat has been completed
 */
export function isStoryBeatCompleted(
  structure: StoryStructure,
  roomNumber: number,
  completedBeats: number[]
): boolean {
  return completedBeats.includes(roomNumber);
}

/**
 * Get the next expected story beat
 */
export function getNextStoryBeat(
  structure: StoryStructure,
  completedBeats: number[]
): StoryBeat | null {
  return structure.storyBeats.find(beat => !completedBeats.includes(beat.roomNumber)) || null;
}

/**
 * Calculate story alignment score (0-100)
 * Measures how well the playthrough is following the intended story
 */
export function calculateStoryAlignment(
  structure: StoryStructure,
  currentRoom: number,
  completedBeats: number[],
  metCharacters: string[]
): number {
  let score = 0;
  const totalPoints = 100;

  // 1. Room progression (40 points)
  // Are they going through rooms in order?
  const expectedRoom = completedBeats.length;
  if (currentRoom === expectedRoom) {
    score += 40;
  } else if (Math.abs(currentRoom - expectedRoom) <= 1) {
    score += 20; // Close enough
  }

  // 2. Beat completion (40 points)
  // Have they completed the expected beats?
  const beatCompletionRate = completedBeats.length / structure.storyBeats.length;
  score += Math.floor(beatCompletionRate * 40);

  // 3. Character encounters (20 points)
  // Have they met the key characters?
  const allKeyCharacters = new Set<string>();
  structure.storyBeats.forEach(beat => {
    beat.keyCharacters.forEach(char => allKeyCharacters.add(char.toLowerCase()));
  });

  const metKeyCharacters = metCharacters.filter(name =>
    allKeyCharacters.has(name.toLowerCase())
  );
  const characterRate = metKeyCharacters.length / allKeyCharacters.size;
  score += Math.floor(characterRate * 20);

  return Math.min(100, Math.max(0, score));
}
