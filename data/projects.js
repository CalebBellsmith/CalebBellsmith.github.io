const PROJECTS = [
  {
    id: 'scanner',
    title: 'Automated Microscope Slide Scanner',
    subtitle: 'Motorized slide scanning with automated capture, machine learning quality control, and a full analysis pipeline.',
    thumbnail: 'images/placeholder.jpg',
    skills: ['Computer Vision', 'Machine Learning', 'ESP32'],
    // Built during co-op placement
    categories: ['coop'],
    images: [
      { src: 'images/placeholder.jpg', alt: 'Slide Scanner' }
    ],
    techSummary: [
      { label: 'Why',   text: 'To replace a slow, manual microscope inspection process with an automated scan which captures, screens, and analyzes an entire sample without operator involvement.' },
      { label: 'How',   text: 'A desktop app drives three stepper motors through an ESP32 over serial, capturing a grid of images from the microscope camera and scoring every frame for quality before it reaches analysis.' },
      { label: 'Specs', text: 'Customizable capture sequences, a MobileNetV3 quality classifier, a scratch detection pipeline translated from old MATLAB code, and automatic focus adjustment.' }
    ],
    writeup: [
      { heading: 'Automating a Manual Process' },
      { paragraph: 'Inspecting a sample by hand meant an operator moving the stage, judging each field of view by eye, and recording results manually, which was both slow and inconsistent between people. The scanner moves the stage in a user set grid, captures at every position, and nudges in a small spiral to recapture whenever a frame comes back unusable, so a full slide finishes unattended.' },
      { paragraph: 'Frame quality is scored by a MobileNetV3 classifier trained on 1000+ images to achieve a 99.3% consistency from old values. This same data is used to quickly check each frame for whether it"'"s focused, upon which the 3rd stepper will adjust until satisfactory. ' },
      { paragraph: 'The analysis stage is a direct translation of older lab routines into Python, reproducing its morphological operations and peak finding behaviour exactly so results stayed comparable to years of prior data. Everything lands in a formatted workbook with per sample tabs, descriptive statistics, and a summary comparison across the set.' }
    ]
  },

  {
    id: 'roller',
    title: 'Automated Nano Film Roller',
    subtitle: 'A motorized winding machine with closed loop encoder control, a touchscreen interface, and fully resumable cycles.',
    thumbnail: 'images/placeholder.jpg',
    skills: ['Embedded Systems', 'Firmware', 'Machine Design'],
    // Built during co-op placement
    categories: ['coop'],
    images: [
      { src: 'images/placeholder.jpg', alt: 'Auto Roller' }
    ],
    techSummary: [
      { label: 'Why',   text: 'To replace a repetitive manual winding task of nano film with a machine which runs a consistent, repeatable cycle on its own, freeing an operator from standing over it.' },
      { label: 'How',   text: 'An ESP32 runs all real time control, driving a 24V gearmotor through an H bridge with full quadrature encoder feedback, and presents a touchscreen so the machine runs completely standalone.' },
      { label: 'Specs', text: '3600 encoder pulses per output revolution through a 56:1 gearbox, cycles stored in onboard flash, progress which survives a full power cut, and a hardware emergency stop wired directly into the DC rail. All complying with Canadian electrical and workplace regulations.' }
    ],
    writeup: [
      { heading: 'A Machine That Runs Itself' },
      { paragraph: 'The design is deliberately simple, geared towards daily manufacturing and roll processing. Every piece of real time control lives on the microcontroller, and the laptop app is only used to author cycles and watch telemetry. Cycles are written into onboard flash, so once a recipe is loaded the machine is fully independent and the operator drives it entirely from the touchscreen.' },
      { paragraph: 'The entire design was largely based on workplace regulation and ESA guildlines. A stall is treated as a fault rather than something to retry, the software stop is always graceful, and the emergency stop is a mushroom switch in the DC positive rail which cuts everything at once, meaning firmware can treat every startup as a cold boot. Progress is written to flash periodically, so a cycle interrupted by a power cut can resume from the exact pulse count where it stopped.' },
      { paragraph: 'This design will effectively eliminate the need for manual rolling, with the future option of in line scanning systems for nano film defects. ' }
    ]
  },

  {
    id: 'canoe',
    title: 'Custom Cedar Strip Canoe',
    subtitle: 'A 17-foot custom vessel blending digital fabrication with traditional woodworking.',
    thumbnail: 'images/canoe.jpg',
    skills: ['CAD Modeling', 'CNC Machining', 'Woodworking'],
    // Canoe is categorised as design — it's a fabrication/craft-led personal build
    categories: ['design'],
    images: [
      { src: 'images/canoe.jpg',     alt: 'Canoe' },
      { src: 'images/stems.jpg',     alt: 'Stems' },
      { src: 'images/machining.jpg', alt: 'Machining' },
      { src: 'images/frontview.jpg', alt: 'Front View' },
      { src: 'images/earlydays.jpg', alt: 'Early Days' },
      { src: 'images/stemfit.jpg',   alt: 'Stem Fit' }
    ],
    techSummary: [
      { label: 'Why',   text: 'Designed to explore the blend new design technology with traditional woodworking techniques, while creating a high performance outdoor tool.' },
      { label: 'How',   text: 'Utilized CAD for hull hydrodynamics and CNC machined secondary molds to ensure sub millimeter precision over 17 feet.' },
      { label: 'Specs', text: 'Cedar construction with bead-and-cove joinery, reinforced with fiberglass and a marine grade epoxy finish.' }
    ],
    writeup: [
      { heading: 'Precision Woodworking & Digital Logic' },
      { paragraph: 'The main fun challenge of this build lay in maintaining perfect hull symmetry over a massive span. By using CNC-machined molds we were able to translate a digital model into a physical form with far greater accuracy than traditional manual measurements allow.' },
      { paragraph: 'The construction utilized a meticulous "bead and cove" joinery method, where each individual cedar strip was hand milled and aligned to create a seamless shell. This process ensured a structurally sound foundation for the subsequent fiberglass lamination, resulting a function, yet beautiful result.' }
    ]
  },

   {
    id: 'arm',
    title: 'Robotic Arm',
    subtitle: 'A precision robotic arm, 5 DoF with adaptive control and custom power conversion circuits.',
    thumbnail: 'images/robo arm.jpg',
    thumbFit: 'contain',
    skills: ['Microcontrollers', 'Firmware', 'Custom Circuits'],
    categories: ['design'],
    images: [
      { src: 'images/robo arm.jpg', alt: 'Robotic Arm' },
      { src: 'images/robo draft1.jpg',     alt: 'Initial Draft' }
    ],
    techSummary: [
      { label: 'Why',   text: 'Designed to act as a second set of helping hands in a lab or soldering setting, with an emphasis on precision and control. ' },
      { label: 'How',   text: '5 DoF with an ESP 32 for overall control, with a 1 newton meter grip strength. Adapted to be run off a macbook charger for ease of use, with options including joysticks, or a wireless IMU sleeve (see Motion Sleeve page).' },
      { label: 'Specs', text: 'Fully PETG custom designed parts, including a 3D printed bearing. MG99R servos held at max 6V power, complete with counterweights for longevity.' }
    ],
    writeup: [
      { heading: 'Robotic Arm' },
      { paragraph: 'The core challenge of this build was designing a mechanically stable arm while developing firmware capable of smooth, proportional control across all axes simultaneously. Rather than relying on a development boards native power supply, I designed a dedicated power path using a USB-C PD trigger board to pull the required voltage directly from a laptop charger, keeping the system compact and cable-managed.'},
      { paragraph: 'On the firmware side, the ESP32Servo library was tuned through continual testing to establish precise servo limits and calibrated ADC center values for each joystick axis. To handle the mechanical realities of a cantilevered arm, a counterweight system was integrated at the shoulder joint to reduce servo load and improve positional stability under extension.'},
    ]
  },

  {
    id: 'maze',
    title: 'Tilting Maze Platform',
    subtitle: 'Autonomous maze solving through computer vision, adaptive PID control, and machine learning path memory.',
    thumbnail: 'images/fullmaze.jpg',
    thumbFit: 'contain',
    skills: ['Embedded Systems', 'ESP32', 'Mechatronics'],
    categories: ['design'],
    images: [
      { src: 'images/balance.jpg',      alt: 'Maze Platform View' },
      { src: 'images/fullmaze.jpg',     alt: 'Full Maze View' },
      { src: 'images/computerview.jpg', alt: 'Computer Vision Debug View' }
    ],
    techSummary: [
      { label: 'Why',   text: 'To build a fully autonomous system that combines real time computer vision, closed loop control theory, and machine learning.' },
      { label: 'How',   text: 'An ESP32 drives two high torque servos on a 3D printed dual axis platform, commanded by a Python computer vision pipeline over serial communication.' },
      { label: 'Specs', text: 'Adaptive PID controller, HSV based orange ball tracking, Artificial Potential Field navigation, and an on disk trajectory learning system with four operating modes.' }
    ],
    writeup: [
      { heading: 'How It Works' },
      { paragraph: 'The platform tilts on two axes via servos driven by an ESP32, while a Python computer vision pipeline running on a connected computer handles all the intelligence. For each frame, the webcam feed is processed using HSV color segmentation to isolate the orange ball, with morphological filtering to clean up noise and a median filter across recent positions to smooth tracking. Wall detection uses inverse brightness thresholding which sets any dark pixel below a set threshold to be treated as a wall boundary. Navigation is built on the Artificial Potential Field method: waypoints generate an attractive force toward the target, and nearby wall pixels generate repulsive forces that scale quadratically with proximity, causing the ball to curve naturally around obstacles rather than drive straight into them.' },
      { paragraph: 'Control output flows through an Adaptive PID controller, where the proportional, integral, and derivative terms handle current error, accumulated drift, and oscillation damping respectively. The system auto tunes its own gains every 60 frames based on actual performance which boosts aggression when sluggish and increases damping when oscillating. A physics predictor runs in parallel, estimating ball velocity via exponential moving average and feeding a predicted future position into the error signal to compensate for the physical inertia of the ball. All of this is visualized live in a debug overlay showing force vectors, servo angles, speed, and PID state in real time.' },
      { heading: 'Operating Modes' },
      { paragraph: 'The joystick button cycles through four modes via click count, with the ESP32 broadcasting the active state over serial so the Python pipeline stays in sync.' }
    ],
    modes: [
      {
        number: 'Mode 1 — 1 Click',
        title: 'Lock',
        body: 'Both servos are held at 90° and all serial commands from the computer are ignored. The platform sits completely level. This is the safe idle state used when setting up waypoints, repositioning the ball, or pausing between runs. Because the ESP32 handles this entirely in firmware, the platform stays locked even if the Python script loses connection.'
      },
      {
        number: 'Mode 2 — 2 Clicks',
        title: 'Manual',
        body: 'The joystick directly maps to servo angles in real time, no computer involvement at all. Analog joystick readings from 0–4095 are mapped linearly to the 0°–180° servo range entirely on the ESP32. This mode is useful for manually navigating the maze, testing the physical range of motion of the platform, and verifying that both axes respond correctly before switching to autonomous modes.'
      },
      {
        number: 'Mode 3 — 3 Clicks',
        title: 'Auto Waypoint',
        body: 'The Python pipeline takes full control. Using the detected ball position, it computes an attraction force directly toward the current waypoint and runs it through the Adaptive PID and physics predictor to generate a servo command each frame. There is no wall avoidance in this mode so the system pulls straight toward each target regardless of what is in between.'
      },
      {
        number: 'Mode 4 — 4 Clicks',
        title: 'Auto Smart',
        body: 'Everything in Auto Waypoint, plus wall repulsion and machine learning path memory. Every time the ball successfully reaches a waypoint, the trajectory is recorded to disk. On subsequent runs, the system retrieves the shortest previously successful path and uses it as intermediate guided targets.'
      }
    ]
  },

  {
    id: 'centrifuge',
    title: 'Centrifuge for Space',
    subtitle: 'FILLER: one line summary of the centrifuge and what it is for.',
    thumbnail: 'images/placeholder.jpg',
    skills: ['Mechanical Design', 'Prototyping', 'CAD'],
    categories: ['collaborative'],
    images: [
      { src: 'images/placeholder.jpg', alt: 'Centrifuge' }
    ],
    techSummary: [
      { label: 'Why',   text: 'FILLER: why this project exists and what problem the centrifuge is meant to solve.' },
      { label: 'How',   text: 'FILLER: how it works, the approach taken, and which parts I was personally responsible for.' },
      { label: 'Specs', text: 'FILLER: key numbers, materials, and hardware details worth calling out.' }
    ],
    writeup: [
      { heading: 'Centrifuge for Space' },
      { paragraph: 'FILLER: first paragraph. Set up the context of the project, who it was built with, and what the goal was.' },
      { paragraph: 'FILLER: second paragraph. Describe the design and engineering work in more detail, including the interesting problems and how they were solved.' }
    ]
  },

  {
    id: 'pcb',
    title: 'Custom EMG Signal Processing PCB',
    subtitle: 'A hardware solution for biopotential data collection and wireless transmission.',
    thumbnail: 'images/tru leg.jpg',
    thumbFit: 'contain', 
    skills: ['KiCad', 'Custom Circuits'],
    // PCB is categorised as collaborative — built for the True North Biocompetition team
    categories: ['collaborative'],
    images: [
      { src: 'images/tru leg.jpg', alt: 'PCB Schematic Design' },
      { src: 'images/schematic.jpg', alt: 'PCB Schematic Design' },
      { src: 'images/physical.jpg',  alt: 'Physical PCB Layout' }
    ],
    techSummary: [
      { label: 'Why',            text: 'To reduce signal noise in EMG data collection and create a compact processing system for a wearable diagnostic prosthetic.' },
      { label: 'Specifications', text: 'USB-C powered, 3-channel EMG input, 5V/2.5V/GND rail distribution, and integrated Bluetooth (ESP32) communication.' },
      { label: 'Hardware Stack', text: 'Designed in KiCad, it utilizes a Teensy for high speed ADC and an ESP32 for wireless data transmission.' }
    ],
    writeup: [
      { heading: 'True North Biocompetition' },
      { paragraph: 'EMG data is notoriously difficult to work with, especially from multiple sensors at once. As such, this PCB was designed to take in data from up to three different sensors, process it and compact it, and export it via bluetooth to a computer for further analytics. I produced this board for the True North Biocompetition, in which it will pick up a user\'s muscle data as they wear a leg brace, and export it to an app to track their recovery.' },
      { paragraph: 'The board features a USB-C power input with a filtering circuit to ensure stable voltage across all components. It processes three independent signal lines from EMG sensors through a Teensy microcontroller, leveraging its superior ADC capabilities. The processed data is then handed off to an ESP32, which uses Bluetooth to transmit signals to an outside device with minimal latency.' },
      { paragraph: 'Key design considerations included trace width for power rails, placement of decoupling capacitors to suppress switching noise, and the inclusion of dedicated 5V and 2.5V breakout pins for auxiliary hardware.' }
    ]
  },

  {
    id: 'optimization',
    title: 'Optimization Code',
    subtitle: 'Two computer vision tools which replaced manual optical measurement with automated, repeatable batch analysis.',
    thumbnail: 'images/placeholder.jpg',
    skills: ['Computer Vision', 'Python', 'Data Analysis'],
    // Built during co-op placement
    categories: ['coop'],
    images: [
      { src: 'images/placeholder.jpg', alt: 'Optimization Code' }
    ],
    techSummary: [
      { label: 'Why',            text: 'Manual optical measurements were slow and varied noticeably between operators, so both tools were built to produce repeatable numbers straight from photographs with no human judgement in the loop.' },
      { label: 'How',            text: 'Each tool runs a phase based desktop interface over a shared analysis core, batching folders of images through a calibrated pipeline and exporting formatted spreadsheets alongside annotated verification images.' },
      { label: 'Specifications', text: 'Distortion analysis through gradient edge detection with polynomial baseline removal and parallel batch processing. Contact angle measurement through envelope extraction, RANSAC baseline fitting, and a median of three independent geometric estimators.' }
    ],
    writeup: [
      { heading: 'Distortion Analysis' },
      { paragraph: 'The original process involved manual photoshop editting before an outdated MATLAB script could read them, which made a full batch frustratingly slow. The replacement reads raw camera files directly, automatically crops and rotates each frame against a reference target, then finds vertical edges once from a mean gradient profile and refines them row by row, which is a large speed up while producing numerically identical output to the routine it replaced.' },
      { paragraph: 'Each edge has a quadratic baseline removed before peaks are measured against configurable criteria, and flagged events are boxed onto an output image so a person can verify what the software decided. A run exports a workbook with summary, parameter, and criteria tabs, generates distribution plots, and appends to a running master file so results accumulate across months. I validated it against five paired batches of historical data to confirm the two pipelines agree before retiring the old one.' },
      { heading: 'Contact Angle Measurement' },
      { paragraph: 'This tool measures droplet contact angles from backlit side profile photographs. For every column it anchors to the local brightness peak and scans downward for the first sustained dark run, which builds a silhouette that survives uneven and partially filled backlighting. A RANSAC fit finds the substrate baseline, and the angle itself is the median of three independent estimators, with the spread between them used as an automatic confidence flag rather than a number the operator has to trust blindly.' },
      { paragraph: 'A second detection regime handles translucent droplets on reflective substrates, where the light passes through rather than casting a silhouette. In this case reflection becomes the measurement, since the contact line is the axis for which the droplet and its mirror image are symmetric. The tool picks its own regime per image and falls back to click assisted modes when a sample is ambiguous.' }
    ]
  },

  {
    id: 'lantern',
    title: 'Lantern Light Controller',
    subtitle: 'A microcontroller swap which replaced a sealed factory controller with custom addressable lighting firmware.',
    thumbnail: 'images/placeholder.jpg',
    skills: ['ATtiny85', 'Firmware', 'Circuit Repair'],
    categories: ['design'],
    images: [
      { src: 'images/placeholder.jpg', alt: 'Lantern' }
    ],
    techSummary: [
      { label: 'Why',   text: 'The lantern string lights were locked to a single factory preset by a controller which had locked proprietary firmware, so the controller was replaced and my own code was inserted.' },
      { label: 'How',   text: 'A Digispark ATtiny85 taps the existing 5V rail, and the data trace running to the light string was cut and intercepted, leaving the original controller in place to keep running the main lamp.' },
      { label: 'Specs', text: 'Thirty three individually addressable nodes across nine modes, cycled by the lantern original button with a short press to change mode and a hold to turn off.' }
    ],
    writeup: [
      { heading: 'Reverse Engineering the Lantern' },
      { paragraph: 'The first hurdle was working out what the factory controller actually did. This involved probing the board found the data line feeding the light string and the button input for the main lamp, but no serial interface anywhere, which pointed to a one time programmable chip that could never be reflashed. Rather than replace the whole board I cut a single trace and intercepted only the data line, so the original controller still runs the main lamp and the several amps of string current never pass through the board I added.' },
      { paragraph: 'The string itself was mislabeled. Listed as four channel, it turned out to be three channel with an unusual colour order, which only became clear after a red test pattern came back green. The stock library also produced scrambled output because it has no timing table for the unusual clock speed of this particular board, so the driver came from a different source whose timing buckets covered it.' },
      { paragraph: 'The most satisfying part was a fault which looked like a firmware bug and was not. Multi colour modes kept losing channels in a strangely consistent order, blue first and red last, which is forward voltage order and therefore a power problem rather than a data one. The culprit was a damaged MOSFET in the power path passing current only through its body diode, so the rail held fine at low current and collapsed under load. Bridging it confirmed the diagnosis instantly, and every colour mode I had been carefully compensating became correct again.' }
    ]
  },

  {
    id: 'tilt',
    title: 'Roll Angle Test Rig',
    subtitle: 'A motorized tilting platform which measures the angle at which droplets release from a surface.',
    thumbnail: 'images/placeholder.jpg',
    skills: ['Mechatronics', 'Python', 'CAD'],
    // Built during co-op placement
    categories: ['coop'],
    images: [
      { src: 'images/placeholder.jpg', alt: 'Roll Angle Test Rig' }
    ],
    techSummary: [
      { label: 'Why',   text: 'To measure roll off angle repeatably, replacing a hand tilted fixture where one person had to control the tilt, watch for release, and read the angle all at the same moment.' },
      { label: 'How',   text: 'A servo controller drives the tilting sample plate while a rotary potentiometer on the pivot reports true plate angle back to a Python application, closing the loop on actual position rather than commanded position.' },
      { label: 'Specs', text: 'Calibrated potentiometer feedback at roughly eight counts per degree, a one degree positioning deadband, keyboard shortcuts to log up to nine droplets per run, and direct Excel export.' }
    ],
    writeup: [
      { heading: 'Measuring Roll Off Angle' },
      { paragraph: 'The plate sweeps slowly upward from level while the operator simply watches the droplets. Holding one key and pressing a number records that droplet at the current measured angle, which removes the hardest part of the manual method, since nobody has to read a protractor at the exact instant something moves. Pause, resume, and return to home are all single keystrokes, so the whole test runs without touching the mouse.' },
      { paragraph: 'Angle is read from a potentiometer on the pivot, averaged across samples and converted through a calibrated offset and scale, then the servo is driven forward or backward until the reading sits inside the deadband. Because the feedback comes from the plate rather than the servo, backlash and mounting slop in the linkage do not corrupt the recorded angle. The controller port is discovered automatically so the same application runs on either operating system in the lab, and results export straight to a spreadsheet with the sample and droplet order preserved.' },
      { paragraph: 'The mechanical side is a 3D printed jig and pivot pin designed around holding samples at a repeatable position relative to the axis of rotation, which matters because an inconsistent mounting height changes the effective angle a droplet experiences.' }
    ]
  },

   {
    id: 'jolt',
    title: 'Jolt Mouse',
    subtitle: 'Wearable arm sleeve for amputee patients which wirelessly connects and controls a computer mouse.',
    thumbnail: 'images/joltflex.jpg',
    thumbFit: 'contain',
    badge: '⚡ Built at Hack Canada 2025',
    skills: ['Microcontrollers', 'IMU', 'EMG'],
    categories: ['design'],
    images: [
      { src: 'images/joltflex.jpg', alt: 'Jolt Sleeve' },
      { src: 'images/jolt.jpg',     alt: 'Jolt Hardware' }
    ],
    techSummary: [
      { label: 'Why',   text: 'Created during the Hack Canada Hackathon to reconnect amputee or upper limb disabled patients to computers as simply as a normal Bluetooth mouse would.' },
      { label: 'How',   text: 'An IMU gyroscope measures tilt, while EMG sensors and a button control clicking and freezing. All processed by an ESP32 microcontroller, which wirelessly connects via Bluetooth.' },
      { label: 'Specs', text: 'EMG and IMU controlled. BLE pipeline to the computer. Companion web dashboard for live monitoring of power, sensitivity, and EMG positioning.' }
    ],
    writeup: [
      { heading: 'Jolt' },
      { paragraph: 'Jolt is a wireless, wearable arm sleeve that turns natural arm motion into full computer cursor control. An IMU mounted on the sleeve tracks the orientation and movement of your forearm in real time, translating tilts and gestures into smooth, proportional mouse movement across your screen. No desk, no surface, no traditional mouse required.' },
      { paragraph: 'The hardware is built around an ESP32, which reads data from the IMU and an EMG sensor, then broadcasts wirelessly over Bluetooth, pairing with any computer exactly like a standard Bluetooth mouse. A physical button on the sleeve lets you instantly freeze the cursor and re zero its position, so you can reposition your arm without sending the pointer flying across the screen. Flexing your forearm triggers the EMG sensor to register a click, keeping the interaction feel intuitive and physical.' },
      { paragraph: 'Alongside the sleeve sits a companion web dashboard where you can monitor and tune the system in real time: adjusting cursor sensitivity, toggling the freeze state, repositioning the EMG sensor\'s reference point, and watching live data from the sensors. Everything that would otherwise require digging into firmware can be controlled from the browser.' }
    ]
  },

  {
    id: 'solidworks',
    title: 'Technical Design Gallery',
    subtitle: 'Advanced surfacing and technical CAD assemblies.',
    thumbnail: 'images/swjet.jpg',
    skills: ['Surface Modeling', 'Mechanical Assembly'],
    categories: ['personal'],
    images: [
      { src: 'images/swjet.jpg',    alt: 'Jet Turbine' },
      { src: 'images/swflower.jpg', alt: 'Organic Flower Surface' },
      { src: 'images/magno.png',    alt: 'Magno Design' },
      { src: 'images/card.png',     alt: 'Card Design' },
      { src: 'images/IMG_1133.jpg', alt: 'Assembly' }
    ],
    techSummary: [
      { label: 'Proficiency',  text: 'Parametric Modeling' },
      { label: 'Techniques',   text: 'Surface Geometries' },
      { label: 'Applications', text: 'Mechanical Simulation' }
    ],
    writeup: [
      { heading: 'The Digital Workbench' },
      { paragraph: 'This gallery showcases surfacing modeling such as the jet turbine and organic geometry, alongside precise mechanical assemblies intended for real world fabrication.' }
    ]
  },

  {
    id: 'design',
    title: 'Wood Working Design',
    subtitle: 'A collection of custom works through a variety of styles and wood types',
    thumbnail: 'images/carving.jpg',
    thumbFit: 'contain',
    skills: ['Custom Design', 'Multimedium'],
    // Personal Design is categorised as personal — solo artistic/craft work
    categories: ['personal'],
    images: [
      { src: 'images/carving.jpg', alt: 'Carving' },
      { src: 'images/cutting board.jpg', alt: 'Cuttingboards' },
      { src: 'images/cutting board other.jpg', alt: 'More Cuttingboards' },
      { src: 'images/box.jpg', alt: 'Wooden Box' },
    ],
    techSummary: [
      { label: 'Why',      text: 'Although it\'s not a terribly technical project, I\'ve always loved woodworking and carving, so I fill my off time with some less technical design.' },
      { label: 'What',  text: 'Handcarved 6 square foot tree, end grain and edge grain boards, and a bookmatched flowing box' },
    ],
    writeup: [
      { heading: 'Wood Working' },
      { paragraph: 'Although I do really love technical design, at times, it is really nice to get a little more hands on and work on a super applicable project. I\'ve long loved the outdoors, so this is just another way to connect with that for me.' },
    ]
  },

  {
    id: 'metal working',
    title: 'Metal Working Design',
    subtitle: 'A collection of custom works, made by customer request, or for personal enjoyment',
    thumbnail: 'images/rings.jpg',
    thumbFit: 'contain',
    skills: ['Custom Design', 'Welding'],
    // Personal Design is categorised as personal — solo artistic/craft work
    categories: ['personal'],
    images: [
      { src: 'images/rings.jpg',   alt: 'Copper Rings' },
      { src: 'images/cross.jpg',   alt: 'Rail Spike Cross' },
      { src: 'images/necklace.jpg', alt: 'Copper Necklace' },
    ],
    techSummary: [
      { label: 'Why',      text: 'Similarly to my love of wood working, metal working provides a creative outlet, while still learning applicable skills and meeting customer requests.' },
      { label: 'Mediums',  text: 'MIG, TIG and ARC welding of railway spikes, as well as fine copper weaving and soldering ' },
    ],
    writeup: [
      { heading: 'Metal Exploration' },
      { paragraph: 'The railway spike cross and copper cross are both projects I undertook out of my love for creation, while the copper rings and other copper crosses I created at customer requests. Realistically though, I just love the ability to create, whether technical or not, of which, matal working is merely another faucet of.' },
    ]
  },
  
  {
    id: 'Wood Burning',
    title: 'Wood Burning Design',
    subtitle: 'A collection of custom works, made by customer request, or for personal enjoyment',
    thumbnail: 'images/tree.jpg',
    thumbFit: 'contain',
    skills: ['Custom Design', 'Wood Burning'],
    // Personal Design is categorised as personal — solo artistic/craft work
    categories: ['personal'],
    images: [
      { src: 'images/tree.jpg',   alt: 'Nortic Tree' },
      { src: 'images/wolf.jpg',   alt: 'Animal Art' },
      { src: 'images/bookmark.jpg', alt: 'Personalized Bookmarks' },
    ],
    techSummary: [
      { label: 'Why',      text: 'To experiement with a slighly more traditionally artistic aspect of woodworking' },
      { label: 'What',  text: 'I woodburn inscriptions and personalizations on many of my pieces as a finishing touch.' },
    ],
    writeup: [
      { heading: 'Material Exploration' },
      { paragraph: 'Woodburning to me represented a final aspect of fun simple design that I could tackle, both for customer requests (custom ordering) or for personal enjoyment. ' },
    ]
  },

  {
    id: 'prosthetics',
    title: 'Custom Finger Prosthetics',
    subtitle: 'Ergonomic restoration of fine motor skills for scleroderma patients.',
    thumbnail: 'images/pencilfinger.jpg',
    skills: ['SolidWorks', '3D Scanning', 'Human Factors'],
    categories: ['personal'],
    images: [
      { src: 'images/pencilfinger.jpg',       alt: 'Main View' },
      { src: 'images/issue.jpg',              alt: 'Design Detail' },
      { src: 'images/prosthetic_fingers.jpg', alt: 'Patient Fitting' }
    ],
    techSummary: [
      { label: 'Why',   text: 'To restore writing ability and daily usability for a patient with amputations resulting from scleroderma.' },
      { label: 'How',   text: 'Ergonomic SolidWorks modeling featuring specialized tool inserts and lockable rotation to account for daily tasks.' },
      { label: 'Specs', text: 'Custom fitted socket designed for pressure distribution and fine motor task use.' }
    ],
    writeup: [
      { heading: 'Human Centered Engineering' },
      { paragraph: 'These prosthetics were created for a patient with advanced scleroderma, resulting in the amputation of their fingers. I utilized scans of the patient\'s hand to ensure sound socket fit, preventing pressure sores while maintaining enough grip for the user to perform tasks like writing clearly for the first time in years.' },
      { paragraph: 'The design includes modular tips that can be specialized for different activities, as well as a lockable rotational joint that helps the user maintain a natural posture while manipulating tools.' }
    ]
  },

  {
    id: 'exoskeleton',
    title: 'Hand Exoskeletons',
    subtitle: 'Biomechatronics for upper-limb mobility assistance.',
    thumbnail: 'images/test.jpg',
    skills: ['3D Printing', 'Biomechanics'],
    categories: ['personal'],
    images: [
      { src: 'images/hand_exoskeleton.jpg', alt: 'Hand Exoskeleton' },
      { src: 'images/test.jpg',             alt: 'Testing' },
      { src: 'images/failures.jpg',         alt: 'Prototyping Iterations' }
    ],
    techSummary: [
      { label: 'Why',   text: 'Assisting mobility by shifting loads away from small joints.' },
      { label: 'How',   text: '3D-printed linkages integrated with EMG sensor feedback.' },
      { label: 'Specs', text: 'Scalable, modular design with tool-less adjustability.' }
    ],
    writeup: [
      { heading: 'Prototyping Mobility' },
      { paragraph: 'This project involved dozens of 3D printed iterations to balance grip force with lightweight wearability. The idea is a hand exoskeleton which can be worn then locked when the patient needs to have a sustained load (such as moving groceries).'}
    ]
  }
];
