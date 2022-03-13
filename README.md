# space-invaders
Remake of the classic arcade game **_"Space Invaders"_** using Typescript and html

## Rules
```
- the task is to shoot some aliens that are moving towards the player's ship.

- Every time the aliens hit the left or right of the canvas their speed will increase and they will move one step closer to the player’s ship.

- The aliens can collectively shoot max. two bullets at a time.

- The player can shoot max. one bullet at a time

- Each enemy gives the score of its 0 indexed row times 20 (1*20, 2*20, etc.), lowest row gives 10 pts
```

## Power ups
```
- Semi automatic gun (shoot more bullets at a time):
Activated when player reaches 500 points and stays activated for 100 points. Pattern follows every 500 points

- Faster ship:
Activated when the player shoots the red alien that occasionally appears in the map. Stays activated for the rest of the game
```

## Commands
```
'r' key -> reset the game at any point (page reloads)
'c' key -> continue to the next level
```
