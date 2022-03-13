import { fromEvent, interval, merge } from "rxjs";
import { filter, map, scan } from "rxjs/operators";

type Key = "ArrowLeft" | "ArrowRight" | "Space" | "KeyR" | "KeyC";
type Event = "keydown" | "keyup";

function spaceinvaders() {
  const Constants = {
    CanvasSize: 600,
    BulletExpirationTime: 1000,
    BulletVelocity: 4,
    StartTime: 0,
    EnemyNumber: 49,
    EnemyWidth: 30,
    EnemyHeight: 30,
    ShipWidth: 42,
    ShipHeight: 42,
    BulletWidth: 2,
    BulletHeight: 4,
    EnemyStartingVel: 0.5,
    Down: "down",
    Up: "up",
    ShieldBlockWidth: 26,
    ShieldBlockHeight: 26,
    ShieldsBlocks: 10,
    ShieldNum: 3,
    NumberOfBulletsSemiAutoPowerUp: 5,
    ScaleShipSpeedPowerUp: 1.5,
    PowerUpWidth: 5,
    PowerUpHeight: 17.5,
    PowerUpTargetVel: 3,
    shieldBlockPos: [
      [
        [100, 400],
        [125, 400],
        [150, 400],
        [175, 400],
        [100, 425],
        [100, 450],
        [175, 425],
        [175, 450],
        [150, 425],
        [125, 425],
      ],
      [
        [275, 400],
        [300, 400],
        [325, 400],
        [350, 400],
        [275, 425],
        [275, 450],
        [350, 425],
        [350, 450],
        [325, 425],
        [300, 425],
      ],
      [
        [450, 400],
        [475, 400],
        [500, 400],
        [525, 400],
        [450, 425],
        [450, 450],
        [525, 425],
        [525, 450],
        [500, 425],
        [475, 425],
      ],
    ],
  };

  // our game has the following view element types:
  type ViewType =
    | "ship"
    | "bullet"
    | "enemy"
    | "shield"
    | "enemyBullet"
    | "powerUp";

  // Four types of game state transitions
  class Tick {
    constructor(public readonly elapsed: number) { }
  }
  class Move {
    constructor(
      public readonly vel: number,
      public readonly keyEvent: string
    ) { }
  }
  class Shoot {
    constructor(public readonly on: boolean) { }
  }
  class resetGame {
    constructor(public readonly soft: boolean) { }
  }

  /**
   * A simple immutable vector class
   */
  class Vec {
    constructor(public readonly x: number = 0, public readonly y: number = 0) { }
    add = (b: Vec) => new Vec(this.x + b.x, this.y + b.y);
    // sub = (b: Vec) => this.add(b.scale(-1))
    // scale = (s: number) => new Vec(this.x * s, this.y * s)
    ortho = () => new Vec(this.y, -this.x);

    static Zero = new Vec();
  }

  // all the observables used to play the game
  const gameClock$ = interval(10).pipe(map((elapsed) => new Tick(elapsed))),
    keyObservable = <T>(e: Event, k: Key, result: () => T) =>
      fromEvent<KeyboardEvent>(document, e).pipe(
        filter(({ code }) => code === k),
        filter(({ repeat }) => !repeat),
        map(result)
      ),
    stopMoveLeft$ = keyObservable(
      "keyup",
      "ArrowLeft",
      () => new Move(0, Constants.Up)
    ),
    startMoveLeft$ = keyObservable(
      "keydown",
      "ArrowLeft",
      () => new Move(-5, Constants.Down)
    ),
    startMoveRight$ = keyObservable(
      "keydown",
      "ArrowRight",
      () => new Move(5, Constants.Down)
    ),
    stopMoveRight$ = keyObservable(
      "keyup",
      "ArrowRight",
      () => new Move(0, Constants.Up)
    ),
    shoot$ = keyObservable("keydown", "Space", () => new Shoot(true)),
    nextLevel$ = keyObservable("keydown", "KeyC", () => new resetGame(true)), // soft reset
    resetGame$ = keyObservable("keydown", "KeyR", () => new resetGame(false)); // hard reset

  // generic type body for any enemy, bullet, ship, shield etc.
  type ObjectId = Readonly<{ id: string; createTime: number }>;
  type Rectangle = Readonly<{ pos: Vec; width: number; height: number }>;
  interface IBody extends ObjectId, Rectangle {
    viewType: ViewType;
    vel: Vec;
    scale: number;
  }

  type Body = Readonly<IBody>;

  // immutable state
  type State = Readonly<{
    time: number;
    ship: Body;
    bullets: ReadonlyArray<Body>;
    enemyBullets: ReadonlyArray<Body>;
    exit: ReadonlyArray<Body>;
    enemies: ReadonlyArray<Body>;
    shields: ReadonlyArray<Body>;
    objCount: number;
    shipHealth: number;
    gameOver: boolean;
    score: number;
    semiAutoPowerUp: boolean;
    fasterShipPowerUp: boolean;
    powerUps: ReadonlyArray<Body>;
    betweenLevels: boolean;
    currentLevel: number;
  }>;

  // all movement comes through here
  const moveBody = 
  /**
   * 
   * @param b body to be moved
   * @returns new Body object with new position for b
   */
  (b: Body) =>
    <Body>{
      ...b,
      pos: handlePos(b),
    };

  const handlePos = 
  /**
   * only add the velocity to pos if body will not go outside the canvas's x bounds
   * @param b body whose position is to be handled
   * @returns new position of body
   */
  (b: Body) => {
    if (
      (b.pos.x >= 0 && b.pos.x <= Constants.CanvasSize - b.width) ||
      (b.pos.x <= 0 && b.vel.x > 0) ||
      (b.pos.x >= Constants.CanvasSize - b.width && b.vel.x < 0)
    ) {
      return b.pos.add(b.vel);
    } else {
      return b.pos;
    }
  };

  const changeDirection = 
  /**
   * change direction of movement of a body and move it down by 10 places
   * @param b body whose velocity and direction is to be updated
   * @returns new Body Object with new velocity and new position for b
   */
  (b: Body): Body =>
  ({
    ...b,
    vel: new Vec(b.vel.x * -1.05, 0),
    pos: new Vec(b.pos.x, b.pos.y + 10),
  });

  const handleEnemyMovement = 
  /**
   * if the rightmost or leftmost enemies have hit the bounds of the canvas
   * then go down and change direction of movement then call moveBody() to move enemies.
   * if not then move normally by calling moveBody()
   * @param s state of app
   * @returns the enemies after handling their movement
   */
  (s: State): ReadonlyArray<Body> =>
    s.enemies.reduce(
      (lowest: number, b: Body): number => Math.min(lowest, b.pos.x),
      Constants.CanvasSize
    ) <= 0 ||
      s.enemies.reduce(
        (highest: number, b: Body): number => Math.max(highest, b.pos.x),
        0
      ) >=
      Constants.CanvasSize - Constants.EnemyWidth
      ? s.enemies.map(changeDirection).map(moveBody)
      : s.enemies.map(moveBody); // move normally if not

  const handlePowerUpMovement = 
  /**
   * move the power up target outside the visible canvas when it reaches the right side of the canvas
   * if it is already moved outside the canvas then spawn it again with a chance of 0.001
   * @param condition condition to apply to see whether to create a power up target
   * @returns a function
   */
  (condition: boolean) => 
  /**
   * 
   * @param b power up target
   * @returns the moved state of either the existing power up or a new power up created on chance
   */
  (b: Body): Readonly<Body> =>
    b.pos.x >= Constants.CanvasSize - b.width // if the power up has reached the right side of canvas
      ? condition && b.pos.x === 2 * Constants.CanvasSize
        ? moveBody(
          // spawn powerUp target if condition is met
          createFastShipPowerUp({
            id: "1",
            createTime: b.createTime,
          })({
            pos: new Vec(0, randIntInRange(30)(200)),
            width: Constants.PowerUpWidth,
            height: Constants.PowerUpHeight,
          })(new Vec(Constants.PowerUpTargetVel, 0))(0.5)
        )
        : { ...b, pos: new Vec(2 * Constants.CanvasSize, b.pos.y) } // move powerup outside of canvas
      : moveBody(b); // move powerUp target normally

  const randIntInRange = 
  /**
   * 
   * @param min minimum bound of range
   * @returns function that returns random int between min and the given argument
   */
  (min:number) => 
  /**
   * 
   * @param max maximum bound of range
   * @returns random number between min and max
   */
  (max:number)=> Math.floor(Math.random() * (max - min) + min)

  // function to handle passing of time
  const tick = 
  /**
   * this function handles the passing of time in the game
   * @param s state
   * @param elapsed iterations elapsed
   * @returns new updated state based on gameplay
   */
  (s: State, elapsed: number): State => {
    
  const onChance = 
  /**
   * 
   * @param prob probability that this will return true
   * @returns gives you a boolean with the probability n of being true
   */ 
  (prob: number): boolean =>
  parseFloat(Math.random().toFixed(4)) <= prob,
    expired = (b: Body) =>
      b.pos.y >= Constants.CanvasSize - 10 || b.pos.y <= 10, // physical bounds to know when to despawn a body
      expiredBullets: Body[] = [
        ...s.bullets.filter(expired),
        ...s.enemyBullets.filter(expired),
      ],
      activeEnemyBullets = s.enemyBullets.filter(not(expired)),
      activePlayerBullets = s.bullets.filter(not(expired)),
      shouldCreateEnemyBullet = onChance(0.01), // 0.01 probability that an enemy will shoot a bullet
      shouldCreatePowerUp = onChance(0.0005); // 0.0005 probability that a powerUp target will appear

    return handleCollisions({
      ...s,
      ship: moveBody(s.ship),
      bullets: activePlayerBullets.map(moveBody),
      enemyBullets: activeEnemyBullets
        .concat(
          // adding random enemy bullets
          s.enemyBullets.length <= 2 &&
            shouldCreateEnemyBullet &&
            s.enemies.length > 0 // enemies can collectively have three active bullets
            ? createEnemyBullet({
              id: String(s.objCount),
              createTime: s.time,
            })({
              pos: s.enemies[
                Math.floor(Math.random() * s.enemies.length) // randomly choosing which enemy will fire the bullet
              ].pos.add(
                new Vec(Constants.EnemyWidth / 2, Constants.EnemyHeight) // bullet will be spawned from the middle the enemy
              ),
              width: Constants.BulletWidth,
              height: Constants.BulletHeight,
            })(new Vec(0, Constants.BulletVelocity))(1) // velocity
            : [] // add no bullets
        )
        .map(moveBody), // move bullets
      enemies: handleEnemyMovement(s),
      exit: expiredBullets,
      time: elapsed,
      objCount: shouldCreateEnemyBullet ? s.objCount + 1 : s.objCount,
      powerUps: s.powerUps
        .concat(
          shouldCreatePowerUp && s.powerUps.length === 0 && !s.fasterShipPowerUp // add power up based on chance and if not already activated
            ? createFastShipPowerUp({
              id: "1",
              createTime: s.time,
            })({
              pos: new Vec(0, randIntInRange(30)(200)),
              width: Constants.PowerUpWidth,
              height: Constants.PowerUpHeight,
            })(new Vec(Constants.PowerUpTargetVel, 0))(0.5)
            : []
        )
        .map(handlePowerUpMovement(shouldCreatePowerUp)),
        betweenLevels: s.enemies.length === 0
    });
  };

  const createBody =
  /**
   * any entity created in the game will be created here
   * @returns body created based on inputs
   */
    (viewType: ViewType) =>
      (oid: ObjectId) =>
        (rect: Rectangle) =>
          (vel: Vec) =>
            (scale: number) =>
              <Body>{
                ...oid,
                ...rect,
                vel: vel,
                id: viewType + oid.id,
                viewType: viewType,
                scale: scale,
              },
    createFastShipPowerUp = createBody("powerUp"),
    createPlayerBullet = createBody("bullet"),
    createEnemyBullet = createBody("enemyBullet"),
    createShip = createBody("ship"),
    createEnemyBody = createBody("enemy"),
    createShieldBlock = createBody("shield");


  const createEnemies =
  /**
   * recursively create n enemies
   * @param n number of enemies
   * @returns immutable list of Body who represent the enemies
   */ 
  (n: number) => (vel: Vec)=> (scale:number): ReadonlyArray<Body> =>
    n >= 0
      ? [
        ...createEnemies(n - 1)(vel)(scale),
        createEnemyBody({ id: `${n}`, createTime: 0 })({
          pos: new Vec(550 - (n % 10) * 40, 150 - Math.floor(n / 10) * 30),
          width: Constants.EnemyWidth,
          height: Constants.EnemyHeight,
        })(vel)(scale),
      ]
      : [];

  const createShields = 
  /**
   * recursively make n*block shields
   * @param n number of shields to be created
   * @param block number of blocks each shield is made up of
   * @returns 
   */
  (n: number, block: number): ReadonlyArray<Body> =>{
    return (n && block
      ? [
        ...createShields(n, block - 1),
        createShieldBlock({ id: `${n}${block}0`, createTime: 0 })({
          pos: new Vec(
            Constants.shieldBlockPos[n-1][block-1][0], // x pos of shield with id 'shield{n}{block}'
            Constants.shieldBlockPos[n-1][block-1][1] // y pos of shield with id 'shield{n}{block}'
          ),
          width: Constants.ShieldBlockWidth,
          height: Constants.ShieldBlockHeight,
        })(Vec.Zero)(1),
      ]
      : n
        ? createShields(n - 1, Constants.ShieldsBlocks)
        : []);
    }
  
    // this is the initial state the application starts with
  const initialState: State = {
    time: 0,
    ship: createShip({ id: "", createTime: 0 })({
      pos: new Vec(
        Constants.CanvasSize / 2 - Constants.ShipWidth / 2,
        Constants.CanvasSize * (5 / 6)
      ),
      width: Constants.ShipWidth,
      height: Constants.ShipHeight,
    })(Vec.Zero)(1),
    bullets: [],
    enemyBullets: [],
    exit: [],
    enemies: createEnemies(Constants.EnemyNumber)(new Vec(Constants.EnemyStartingVel, 0))(0.5),
    shields: createShields(Constants.ShieldNum, Constants.ShieldsBlocks),
    objCount: 0,
    shipHealth: 3,
    gameOver: false,
    score: 0,
    semiAutoPowerUp: false,
    fasterShipPowerUp: false,
    powerUps: [],
    betweenLevels: false,
    currentLevel: 1,
  };


  const reduceState = 
  /**
   * 
   * @param s state
   * @param e observable that was emitted
   * @returns new updated state based on the observable that was emitted
   */
  (s: State, e: Move | Tick | Shoot | resetGame): State => {
    const calculatePlayerBulletLimit = (s: State): boolean =>
    s.semiAutoPowerUp
      ? s.bullets.length <= Constants.NumberOfBulletsSemiAutoPowerUp
      : s.bullets.length === 0, // number of player bullets allowed based on the power up
  calculateShipVelocity =
    (s: State) =>
      (e: Move): number =>
        s.fasterShipPowerUp ? Constants.ScaleShipSpeedPowerUp * e.vel : e.vel; // calculate ship velocity based on the activation of power up

    return e instanceof resetGame // when c is pressed... reset the positions of ships but keep score, state of shields and lives
      ? s.enemies.length && !s.betweenLevels 
        ? s
        : { // if we are paused between two levels or there are no enemies
          ...initialState,
          ship: s.ship,
          shields: s.shields,
          powerUps: s.powerUps,
          score: s.score,
          shipHealth: s.shipHealth,
          fasterShipPowerUp: s.fasterShipPowerUp,
          semiAutoPowerUp: s.semiAutoPowerUp,
          exit: s.exit.concat([...s.enemyBullets, ...s.bullets]),
          time: s.time,
          objCount: s.objCount,
          currentLevel: s.currentLevel + 1,
          enemies: createEnemies(Constants.EnemyNumber)(new Vec(s.currentLevel, 0))(0.5)
        }
      : e instanceof Move // when arrow keys are pressed
        ? s.ship.vel.x
          ? {
            // if ship is already moving and another key is pressed (opposite key to the one initially held down), stop ship
            ...s,
            ship: { ...s.ship, vel: Vec.Zero },
          }
          : {
            // if ship is stationary
            ...s,
            ship: { ...s.ship, vel: new Vec(calculateShipVelocity(s)(e), 0) },
          }
        : e instanceof Shoot // when space bar is pressed
          ? calculatePlayerBulletLimit(s) // calculates limit of player bullets that can be active at the same time
            ? {
              ...s,
              bullets: s.bullets.concat([
                createPlayerBullet({
                  // adding new player bullet to state when space is pressed
                  id: String(s.objCount),
                  createTime: s.time,
                })({
                  pos: s.ship.pos.add(new Vec(Constants.ShipWidth / 2, 0)),
                  width: Constants.BulletWidth,
                  height: Constants.BulletHeight,
                })(new Vec(0, -Constants.BulletVelocity))(1),
              ]),
              objCount: s.objCount + 1,
            }
            : { ...s } // did not add player bullet because limit of active bullets for player was reached
          : tick(s, e.elapsed); // passing of time
  }

  const handleCollisions = 
  /**
   * handle all collisions between different elements:
   * - between enemy bullets and player's ship
   * - between enemy bullets and shields
   *
   * - between player's bullets and enemies
   * - between player's bullets and shields
   * - between player's bullets and powerups
   *
   * - betweeen enemies bodies and shields
   * @param s state
   * @returns returns a new and updated state object by handling different scenarios caused by collisions
   */
  (s: State) => {
    const // making a list of [T, T] pairs of all the bodies in b1 and b2
      makePairs = <T>(b1: ReadonlyArray<T>) => <U>(b2: ReadonlyArray<U>) =>
        flatMap(b1, (b) => b2.map<[T, U]>((e) => [b, e])),
      first = <T>([first, _]: [T, T]): T => first,
      second = <T>([_, second]: [T, T]): T => second,
      secondsFromPairs = <T>(pairs: ReadonlyArray<[T, T]>): ReadonlyArray<T> =>
        pairs.map(second),
      firstsFromPairs = <T>(pairs: ReadonlyArray<[T, T]>): ReadonlyArray<T> =>
        pairs.map(first),
      cut = except((a: Body) => (b: Body) => a.id === b.id),
      // function to determine if two bodies with rectangular hitboxes have collided
      bodiesCollided = ([a, b]: [Body, Body]): boolean =>
        a.pos.x < b.pos.x + b.width &&
        a.pos.x + a.width > b.pos.x &&
        a.pos.y < b.pos.y + b.height &&
        a.pos.y + a.height > b.pos.y,
      // reusable functions that pass in the first argument needed by makePairs
      enemyBulletsPair = makePairs(s.enemyBullets),
      enemyBodyPair = makePairs(s.enemies),
      bulletsPair = makePairs(s.bullets),
      collidedEnemyAndShipPairs =
        enemyBodyPair([s.ship]).filter(bodiesCollided).length > 0,
      // pairs of different elements that collided
      collidedEnemyBulletsAndShipPairs = enemyBulletsPair([s.ship]).filter(
        bodiesCollided
      ),
      collidedEnemyBulletsAndShieldsPairs = enemyBulletsPair(s.shields).filter(
        bodiesCollided
      ),
      collidedPlayerBulletsAndEnemiesPairs = bulletsPair(s.enemies).filter(
        bodiesCollided
      ),
      collidedPlayerBulletsAndShieldsPairs = bulletsPair(s.shields).filter(
        bodiesCollided
      ),
      collidedPlayerBulletsAndPowerUpPairs = s.betweenLevels ? [] : bulletsPair(s.powerUps).filter(
        bodiesCollided
      ),
      collidedEnemiesAndShieldsPairs = enemyBodyPair(s.shields).filter(
        bodiesCollided
      ),
      // list of all the shield blocks that collided with any bullets or enemy bodies
      collidedShieldBlocks = secondsFromPairs([
        ...collidedPlayerBulletsAndShieldsPairs,
        ...collidedEnemyBulletsAndShieldsPairs,
        ...collidedEnemiesAndShieldsPairs,
      ]);

    const hasSemiAutoPowerUp = (s: State): boolean =>
      /**
       * check to see if ship should have semi-Auto guns
       */
      s.score >= 500 && s.score % 500 <= 100,
      calculateScore = (pairs: ReadonlyArray<[Body, Body]>): number =>
        /**
         * calculate the score to be added to the player due to killing enemies
         * pairs: [player's bullet, enemy body]
         */
        pairs.reduce(
          (a: number, p: [Body, Body]) =>
            a + parseInt(second(p).id.slice(5, -1)) * 20 || 10, // take the enemy from the pair and add to the score based on the enemy's id
          0
        );
        
    const handleCutShields = 
    /**
     * 
     * @param shields all the shields
     * @returns a shields array but the collided shields are either removed or their status (how damaged they are) is updated
     */
      (shields: ReadonlyArray<Body>) =>
      (collidedShieldBlocks: ReadonlyArray<Body>) => {
        const incrementStatus = 
        /**
         * 
         * @param b body to get new status 
         * @returns new and updated body with new status
         */
        (
          b: Body
        ): Body =>
          b.id.slice(-1) != "2" 
          ?({ // update status if status isnt 2
            ...b,
            id: b.id.slice(0, -1) + (parseInt(b.id.slice(-1)) + 1),
          })
          : b; // return the object unchanged if the status was 2

        const includes = 
        /**
         * 
         * @param bodyArray array of type Body 
         * @returns 
         */
        (bodyArray: ReadonlyArray<Body>) =>
        (b: Body): boolean => bodyArray.filter((c)=>c.id === b.id).length > 0;
        
        return cut(
          shields.reduce(
            (a: ReadonlyArray<Body>, s: Body) =>
              includes(collidedShieldBlocks)(s)
                ? [...a, incrementStatus(s)]
                : [...a, s],
            []
          )
        )(collidedShieldBlocks.filter((b: Body) => b.id.slice(-1) === "2")); // status 2 means the shield is destroyed
      };

    return <State>{
      ...s,
      bullets: cut(s.bullets)(
        // removing all bullets that collided with something
        firstsFromPairs([
          ...collidedPlayerBulletsAndEnemiesPairs,
          ...collidedPlayerBulletsAndShieldsPairs,
          ...collidedPlayerBulletsAndPowerUpPairs,
        ])
      ),
      enemies: cut(s.enemies)(
        // removing all enemies that were hit by a players bullets
        secondsFromPairs(collidedPlayerBulletsAndEnemiesPairs)
      ),
      enemyBullets: cut(s.enemyBullets)(
        // removing all enemy bullets that hit something
        firstsFromPairs([
          ...collidedEnemyBulletsAndShipPairs,
          ...collidedEnemyBulletsAndShieldsPairs,
        ])
      ),
      exit: s.exit.concat(
        // adding everything that collided to be removed from the games interface later in updateView()
        collidedShieldBlocks,
        secondsFromPairs([
          ...collidedPlayerBulletsAndEnemiesPairs,
          ...collidedPlayerBulletsAndPowerUpPairs,
        ]),
        firstsFromPairs([
          ...collidedPlayerBulletsAndEnemiesPairs,
          ...collidedPlayerBulletsAndPowerUpPairs,
          ...collidedEnemyBulletsAndShipPairs,
          ...collidedPlayerBulletsAndShieldsPairs,
          ...collidedEnemyBulletsAndShieldsPairs,
        ])
      ),
      // objCount: s.objCount,
      shipHealth: collidedEnemyBulletsAndShipPairs.length // decrease player's lives if it was hit by enemy
        ? s.shipHealth - 1
        : s.shipHealth,
      gameOver: collidedEnemyAndShipPairs || s.shipHealth === 0, // game is over is player has 0 lives
      score: s.score + calculateScore(collidedPlayerBulletsAndEnemiesPairs),
      shields: handleCutShields(s.shields)(collidedShieldBlocks), // remove shields that have collided with something if their status is 3 (last digit of id)
      semiAutoPowerUp: hasSemiAutoPowerUp(s), // semi-auto guns for player's ship
      powerUps: cut(s.powerUps)(
        secondsFromPairs(collidedPlayerBulletsAndPowerUpPairs) // remove power up targets that have been hit
      ),
      fasterShipPowerUp:
        s.fasterShipPowerUp || // once power up is activated players will have it for the rest of the game
        secondsFromPairs(collidedPlayerBulletsAndPowerUpPairs).length > 0, // activate if player has hit the powerup target
    };
  };

  // reset the game if r is pressed
  const hardResetSubscription = resetGame$.subscribe(
    () => (document.location.href = "")
  );

  const subscription = merge(
    gameClock$,
    startMoveLeft$,
    stopMoveLeft$,
    startMoveRight$,
    stopMoveRight$,
    shoot$,
    nextLevel$
  )
    .pipe(scan(reduceState, initialState))//,filter((s)=> !s.betweenLevels))
    .subscribe(updateView);

  function updateView(s: State) {
    /**
     * update the visual interface of the game
     */
    const svg = document.getElementById("canvas")!,
      score = document.getElementById("score"),
      lives = document.getElementById("lives"),
      level = document.getElementById("level"),
      show = (id: string, condition: boolean) =>
        ((e: HTMLElement) =>
          condition ? e.classList.remove("hidden") : e.classList.add("hidden"))(
            document.getElementById(id)!
          ),
          showEnemies = (n: number): void => {
            if (n >= 0) {
              showEnemies(n - 1);
              show(
                `enemy${n}`,
                !document.getElementById("nextLevel").classList.contains("hidden")
              );
            }
          },
      updateBodyView = (b: Body) => {
        function createBodyView() {
          const v = document.createElementNS(svg.namespaceURI, "rect")!;
          attr(v, { id: b.id, width: b.width, height: b.height });
          v.classList.add(b.viewType);
          svg.appendChild(v);
          return v;
        }
        const v = document.getElementById(b.id) || createBodyView();
        attr(v, {
          transform: `translate(${b.pos.x},${b.pos.y}) scale(${b.scale} ${b.scale})`,
        });
      };

    // update the visuals for the different elements below
    updateBodyView(s.ship);
    s.enemies.forEach(updateBodyView);
    s.bullets.forEach(updateBodyView);
    s.enemyBullets.forEach(updateBodyView);
    s.powerUps.forEach(updateBodyView);

    // update score and lives left
    score.innerHTML = `Score: ${s.score} `;
    lives.innerHTML = `Lives left: ${s.shipHealth}`;
    level.innerHTML = `Level: ${s.currentLevel}`;
    
    document.getElementById("fastShip");
    show("fastShip", s.fasterShipPowerUp);
    show("semiAuto", s.semiAutoPowerUp);
    if (s.enemies.length === 0) {
      showEnemies(Constants.EnemyNumber);
    }
    show("nextLevel", s.enemies.length === 0 && s.betweenLevels);
    

    type bodyElementPair = { body: Body; el: HTMLElement };

    const handleShieldExit = 
    /**
     * this function adds the correct css class to the shield block 'body' to show the damage done to it
     * @param bep [body, htmlElement] pair
     * @returns no return value
     */
    (bep: bodyElementPair) =>
      bep.body.id.slice(-1) === "2"
        ? attr(bep.el, {
            transform: `translate(${Constants.CanvasSize * 2},${
              Constants.CanvasSize * 2
            })`,
            class: "hidden",
          })
        : bep.body.id.slice(-1) === "1"
        ? bep.el.classList.add("shieldStatus2")
        : bep.el.classList.add("shieldStatus1");

    s.exit
      .map(
        (o: Body): bodyElementPair => ({
          body: o,
          el: o.viewType === "shield" ? document.getElementById(o.id.slice(0,-1)) : document.getElementById(o.id),
        })
      )
      .filter((bep: bodyElementPair) => isNotNullOrUndefined(bep.el))
      .forEach((bep: bodyElementPair) => {
        try {
          bep.body.viewType === "bullet" || bep.body.viewType === "enemyBullet"
            ? svg.removeChild(bep.el)
            : bep.body.viewType === "shield"
              ? handleShieldExit(bep)
              : attr(bep.el, {
                transform: `translate(${Constants.CanvasSize * 2},${Constants.CanvasSize * 2
                  })`,
                class: "hidden",
              });
        } catch (e) {
          // rarely it can happen that a bullet can be in exit
          // for both expiring and colliding in the same tick,
          // which will cause this exception
          console.log("Already removed: " + bep.el.id);
        }
      });
    if (s.gameOver) {
      subscription.unsubscribe();
      const v = document.createElementNS(svg.namespaceURI, "text")!;
      attr(v, {
        x: Constants.CanvasSize / 6,
        y: Constants.CanvasSize / 2,
        class: "gameover",
      });
      v.textContent = "Game Over";
      svg.appendChild(v);
    }
  }
}

// every function below was copied from the address provided below written by Prof. Tim Dwyer
// https://tgdwyer.github.io/asteroids/
const /**
   * Composable not: invert boolean result of given function
   * @param f a function returning boolean
   * @param x the value that will be tested with f
   */
  not =
    <T>(f: (x: T) => boolean) =>
      (x: T) =>
        !f(x),
  /**
   * is e an element of a using the eq function to test equality?
   * @param eq equality test function for two Ts
   * @param a an array that will be searched
   * @param e an element to search a for
   */
  elem =
    <T>(eq: (_: T) => (_: T) => boolean) =>
      (a: ReadonlyArray<T>) =>
        (e: T) =>
          a.findIndex(eq(e)) >= 0,
  /**
   * array a except anything in b
   * @param eq equality test function for two Ts
   * @param a array to be filtered
   * @param b array of elements to be filtered out of a
   */
  except =
    <T>(eq: (_: T) => (_: T) => boolean) =>
      (a: ReadonlyArray<T>) =>
        (b: ReadonlyArray<T>) =>
          a.filter(not(elem(eq)(b))),
  /**
   * set a number of attributes on an Element at once
   * @param e the Element
   * @param o a property bag
   */
  attr = (e: Element, o: Object) => {
    for (const k in o) e.setAttribute(k, String(o[k]));
  };
/**
 * Type guard for use in filters
 * @param input something that might be null or undefined
 */
function isNotNullOrUndefined<T extends Object>(
  input: null | undefined | T
): input is T {
  return input != null;
}
function flatMap<T, U>(
  a: ReadonlyArray<T>,
  f: (a: T) => ReadonlyArray<U>
): ReadonlyArray<U> {
  return Array.prototype.concat(...a.map(f));
}

if (typeof window != "undefined")
  window.onload = () => {
    spaceinvaders();
  };
