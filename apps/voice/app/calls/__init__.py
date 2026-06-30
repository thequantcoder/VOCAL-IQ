"""Call control surface — lifecycle, LiveKit media, and the /calls/start endpoint.

Day 08 ships the key-independent control plane: the Call lifecycle state machine,
LiveKit access-token minting (pure JWT), and the /calls/start API shape. The live
media bridge (room creation, Pipecat agent join, greeting playback) + Call-row
persistence land once the LiveKit/Deepgram/ElevenLabs keys are set (Day 09 loop).
"""
