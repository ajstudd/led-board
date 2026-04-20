
first tell me if making this project into replacement for lottie files maker would require heavy structural change, if yes, would it be better to create the project in that direction from scratch.
Also what would be better to position this product as , creativity tool as it is right now or a animation maker, or we can do both.
read the growth plan and tell me, do not implement anything, I just need detailed answer with analysis.
No need to show colors in the color palette section, the colors are already being shown in pick color section, only show brand color names, also allow users to create their own brand color set.
Each layer should be independent, their own animations, effects and everything, we can record the whole canvas as a whole though, export functions are not working, also the recording option should only record the configs and actions, upon replay we can just re run the app programatically, the goal is to bring the size of recording file low.
Eventually I want to make this platform as an animation engine, which can be use to create and visualise particle/pixel animations.
I want to replace lottie file maker, make it easier to make Lottie animations using my platform, I will provide built in tools to make animations easier, like just define start and end point, and you can use templates to fill in between. 
Currently when I press clear, not everything on the board clears, I want the board to be cleared, animations to be stopped, everything wiped.
Also I wanted to make 

---
Questions on 18 Apr implementation plan.
Per-layer effects isolation: When Layer 0 has a ripple and Layer 1 has sparkle — should each layer's effects only affect that layer's pixels (more intuitive)? Or should they all blend together on the composite?

Phase 3 scope: Should I implement full multi-layer independence right away (any layer can have animation + effects simultaneously), or start with a simpler version where only the active layer runs animation/effects and extend later? The simpler version is lower risk.