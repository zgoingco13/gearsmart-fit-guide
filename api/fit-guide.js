// /api/fit-guide.js
// Vercel serverless function — uses Claude tool use to generate AR fit-guide steps
// Mirrors the structure of gear-list.js: server-side key, tool_use for guaranteed valid JSON,
// graceful error handling. Output shape matches fit-guide-mock.json so the AR renderer
// needs no changes.

const FIT_GUIDE_TOOL = {
  name: "return_fitting_steps",
  description: "Generate AR-overlay fitting steps for a specific backpacking pack, tailored to the user's torso length and shoulder width. Each step coaches one adjustment with sensory, second-person language and includes 3D overlay coordinates for the AR renderer.",
  input_schema: {
    type: "object",
    properties: {
      product: {
        type: "string",
        description: "Full product name being fitted, e.g. 'Patagonia Black Hole MLC'."
      },
      user_measurements: {
        type: "object",
        description: "The user's body measurements used to tune the fit.",
        properties: {
          torso_in: { type: "number", description: "Torso length in inches." },
          shoulder_width_in: { type: "number", description: "Shoulder width in inches." }
        },
        required: ["torso_in", "shoulder_width_in"]
      },
      generated_by: {
        type: "string",
        description: "Provenance string. Always: 'Claude tool_use · /api/fit-guide'."
      },
      marker_placement: {
        type: "string",
        description: "One sentence telling the user where to start the marker and how it moves across steps. The marker travels: hip belt → shoulder strap → load lifter → sternum strap clip."
      },
      demo_notes: {
        type: "string",
        description: "One short sentence noting this is the 4-step demo configuration. Mention that torso-length check is deferred (AR can't show the user their own back)."
      },
      steps: {
        type: "array",
        minItems: 4,
        maxItems: 4,
        description: "Exactly 4 fitting steps, IN THIS ORDER: 1) Hip belt, 2) Shoulder straps, 3) Load lifters, 4) Sternum strap. Order is fixed — it follows the canonical pack-fitting sequence from the proposal deck.",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              enum: ["Hip belt", "Shoulder straps", "Load lifters", "Sternum strap"],
              description: "Short step name. Must be one of the four allowed values, in order."
            },
            title: {
              type: "string",
              description: "All-caps title for the step header, e.g. 'SET THE HIP BELT', 'SNUG THE SHOULDERS', 'PULL THE LOAD LIFTERS', 'CLIP THE STERNUM STRAP'. 3-5 words. Imperative voice."
            },
            instruction: {
              type: "string",
              description: "The coaching paragraph the user reads while making the adjustment. 3-5 sentences. SECOND PERSON, sensory, anatomy-anchored. Tell them what to feel for, what 'too tight' and 'too loose' feel like, and what to do about it. NO gear-review voice. NO 'ensure that' or 'make sure to'. Write like a friend who has fitted a hundred packs."
            },
            target: {
              type: "string",
              description: "Snake_case anatomical or geometric target, e.g. 'iliac_crest', 'shoulder_anchor', 'load_lifter_45_degrees', 'sternum_one_inch_below_collarbone'."
            },
            tolerance_in: {
              type: "number",
              description: "Acceptable deviation from target in inches. Typically 1.0-1.5."
            },
            marker_placement_hint: {
              type: "string",
              description: "One short phrase telling the user where to move the AR marker for this step. e.g. 'Marker on front-center of hip belt'."
            },
            overlay: {
              type: "object",
              description: "3D overlay coordinates the AR renderer uses to draw target zone and arrow. Coordinates are in marker-space (marker is at origin).",
              properties: {
                targetZone: {
                  type: "object",
                  properties: {
                    position: {
                      type: "array",
                      minItems: 3,
                      maxItems: 3,
                      items: { type: "number" },
                      description: "[x, y, z] position of the target zone center, in marker-space units. y is up. Typical range: -1 to 1."
                    },
                    size: {
                      type: "array",
                      minItems: 2,
                      maxItems: 2,
                      items: { type: "number" },
                      description: "[width, height] of the target zone in marker-space units. Typical range: 0.16 to 1.2."
                    },
                    label: {
                      type: "string",
                      description: "All-caps short label drawn on the target zone, e.g. 'ILIAC CREST', '45° ANGLE'."
                    }
                  },
                  required: ["position", "size", "label"]
                },
                arrow: {
                  type: "object",
                  properties: {
                    from: {
                      type: "array",
                      minItems: 3,
                      maxItems: 3,
                      items: { type: "number" },
                      description: "[x, y, z] arrow tail — typically [0, 0, 0] (the marker)."
                    },
                    to: {
                      type: "array",
                      minItems: 3,
                      maxItems: 3,
                      items: { type: "number" },
                      description: "[x, y, z] arrow head — should match targetZone.position."
                    }
                  },
                  required: ["from", "to"]
                },
                currentLabel: {
                  type: "string",
                  description: "All-caps label drawn at the marker showing where the strap/belt currently is, e.g. 'BELT HERE', 'STRAP HERE', 'CLIP HERE'."
                }
              },
              required: ["targetZone", "arrow", "currentLabel"]
            }
          },
          required: ["name", "title", "instruction", "target", "tolerance_in", "marker_placement_hint", "overlay"]
        }
      }
    },
    required: ["product", "user_measurements", "generated_by", "marker_placement", "demo_notes", "steps"]
  }
};

const SYSTEM_PROMPT = `You are a backpacking-pack fit coach generating step-by-step AR fitting instructions. Your output drives an AR overlay that walks a user through fitting a specific pack to their body.

You generate EXACTLY 4 steps, ALWAYS IN THIS ORDER:
1. Hip belt — sits on the iliac crest
2. Shoulder straps — full contact, no weight transfer
3. Load lifters — roughly 45° angle
4. Sternum strap — one finger-width below the collarbone

This order is fixed. The hip belt carries the load, so it's set first; everything else adjusts relative to it. Do not reorder.

VOICE
Write like a friend who has fitted a hundred packs, not like a gear review. Second person. Sensory and anatomy-anchored. Tell the user what to FEEL for. Describe what "too tight" and "too loose" feel like, then what to do about it. Avoid "ensure that," "make sure to," "it is important that." Avoid REI-website voice.

Reference example (this is the tone to match for every step):

  "Run your thumbs along the top of your hip bones — feel that bony ridge? That's where the top edge of the padded belt should sit. Not on your waist, not under your hips. Cinch it snug, then wiggle side to side. If the pack slides, tighten more. If your breath catches, ease off a notch."

Notice: a body cue ("run your thumbs"), a landmark ("that bony ridge"), what wrong feels like ("breath catches"), what to do about it ("ease off a notch"). Every step should have all four.

OVERLAY COORDINATES
The marker is at origin [0, 0, 0]. y is up. Use these as a starting point and adjust slightly based on the body part:
- Hip belt:        targetZone position around [0, 0.45, 0],   size [1.2, 0.22]
- Shoulder straps: targetZone position around [-0.05, 0.35, 0], size [0.9, 0.18]
- Load lifters:    targetZone position around [0.45, 0.45, 0], size [0.5, 0.5]
- Sternum strap:   targetZone position around [0, 0.55, 0],   size [1.0, 0.16]

arrow.from is always [0, 0, 0]. arrow.to always matches targetZone.position.

TUNING FOR USER
You will receive the user's torso_in and shoulder_width_in. Use these to subtly tailor language where relevant (e.g., shorter torso → mention the load lifters may sit closer to the collarbone; wider shoulders → mention checking that the straps don't dig at the outer edge). Don't force it — only mention if it genuinely changes the fit advice.

PROVENANCE
Set generated_by to exactly: "Claude tool_use · /api/fit-guide"
Set demo_notes to: "4 steps for the demo. Torso-length check is deferred — AR can't show the user their own back."
Set marker_placement to a single sentence describing the marker journey: hip belt → shoulder strap → load lifter → sternum strap clip.`;

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const { product_name, torso_in, shoulder_width_in } = req.body || {};

    if (!product_name || typeof torso_in !== 'number' || typeof shoulder_width_in !== 'number') {
      return res.status(400).json({
        error: 'Missing required fields. Need: product_name (string), torso_in (number), shoulder_width_in (number).'
      });
    }

    const userPrompt = `Generate the 4-step AR fitting guide for this pack and user.

Product: ${product_name}
Torso length: ${torso_in} in
Shoulder width: ${shoulder_width_in} in

Return all 4 steps in canonical order (hip belt → shoulders → load lifters → sternum). Match the voice of the reference example exactly.`;

    // Single retry on transient failures — matches the graceful-retry pattern from gear-list.js
    const callClaude = async () => {
      return fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          tools: [FIT_GUIDE_TOOL],
          tool_choice: { type: 'tool', name: 'return_fitting_steps' },
          messages: [{ role: 'user', content: userPrompt }]
        })
      });
    };

    let claudeResponse = await callClaude();

    if (!claudeResponse.ok && claudeResponse.status >= 500) {
      // One retry on server-side errors
      await new Promise(r => setTimeout(r, 600));
      claudeResponse = await callClaude();
    }

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text();
      console.error('Claude API error:', errorText);
      return res.status(500).json({
        error: 'Trail blocked: fit coach unavailable',
        detail: errorText
      });
    }

    const data = await claudeResponse.json();

    const toolUseBlock = data.content?.find(b => b.type === 'tool_use');

    if (!toolUseBlock || !toolUseBlock.input) {
      console.error('No tool_use block in Claude response:', JSON.stringify(data));
      return res.status(500).json({
        error: 'Trail blocked: fit coach returned unexpected format'
      });
    }

    return res.status(200).json({ guide: toolUseBlock.input });

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({
      error: 'Trail blocked: server error',
      detail: error.message
    });
  }
}
