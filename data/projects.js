const PROJECTS = [
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
      { label: 'Why',   text: 'Designed to explore the limits of custom fabrication while creating a functional, high-performance outdoor tool.' },
      { label: 'How',   text: 'Utilized CAD for hull hydrodynamics and CNC-machined secondary molds to ensure sub-millimeter precision over 17 feet.' },
      { label: 'Specs', text: 'Red Cedar construction with bead-and-cove joinery, reinforced with fiberglass and a marine-grade epoxy finish.' }
    ],
    writeup: [
      { heading: 'Precision Woodworking & Digital Logic' },
      { paragraph: 'The engineering challenge of this build lay in maintaining perfect hull symmetry over a massive span. By integrating CNC-machined stations into the assembly process, I was able to translate a digital model into a physical form with far greater accuracy than traditional manual measurements allow.' },
      { paragraph: 'The construction utilized a meticulous "bead and cove" joinery method, where each individual cedar strip was hand-planed and aligned to create a seamless shell. This process ensured a structurally sound foundation for the subsequent fiberglass lamination, resulting in a vessel that is both a piece of engineering precision and a functional work of art.' }
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
      { label: 'Why',   text: 'Created during the Hack Canada Hackathon to reconnect amputee or upper-limb disabled patients to computers as simply as a normal Bluetooth mouse would.' },
      { label: 'How',   text: 'An IMU gyroscope measures tilt, while EMG sensors and a button control clicking and freezing. All processed by an ESP32 microcontroller, which wirelessly connects via Bluetooth.' },
      { label: 'Specs', text: 'EMG and IMU controlled. BLE pipeline to the computer. Companion web dashboard for live monitoring of power, sensitivity, and EMG positioning.' }
    ],
    writeup: [
      { heading: 'Jolt' },
      { paragraph: 'Jolt is a wireless, wearable arm sleeve that turns natural arm motion into full computer cursor control. An IMU mounted on the sleeve tracks the orientation and movement of your forearm in real time, translating tilts and gestures into smooth, proportional mouse movement across your screen. No desk, no surface, no traditional mouse required.' },
      { paragraph: 'The hardware is built around an ESP32, which reads data from the IMU and an EMG sensor, then broadcasts wirelessly over Bluetooth, pairing with any computer exactly like a standard Bluetooth mouse. No drivers, no dongles, just a seamless connection. A physical button on the sleeve lets you instantly freeze the cursor and re-zero its position, so you can reposition your arm without sending the pointer flying across the screen. Flexing your forearm triggers the EMG sensor to register a click, keeping the interaction feel intuitive and physical.' },
      { paragraph: 'Alongside the sleeve sits a companion web dashboard where you can monitor and tune the system in real time: adjusting cursor sensitivity, toggling the freeze state, repositioning the EMG sensor\'s reference point, and watching live data from the sensors. Everything that would otherwise require digging into firmware can be controlled from the browser.' }
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
      { label: 'Why',   text: 'To build a fully autonomous system that combines real-time computer vision, closed-loop control theory, and machine learning.' },
      { label: 'How',   text: 'An ESP32 drives two high-torque servos on a 3D-printed dual-axis platform, commanded by a Python computer vision pipeline over serial communication.' },
      { label: 'Specs', text: 'Adaptive PID controller, HSV-based orange ball tracking, Artificial Potential Field navigation, and an on-disk trajectory learning system with four operating modes.' }
    ],
    writeup: [
      { heading: 'How It Works' },
      { paragraph: 'The platform tilts on two axes via servos driven by an ESP32, while a Python computer vision pipeline running on a connected computer handles all the intelligence. For each frame, the webcam feed is processed using HSV color segmentation to isolate the orange ball, with morphological filtering to clean up noise and a median filter across recent positions to smooth tracking. Wall detection uses inverse brightness thresholding which sets any dark pixel below a set threshold to be treated as a wall boundary. Navigation is built on the Artificial Potential Field method: waypoints generate an attractive force toward the target, and nearby wall pixels generate repulsive forces that scale quadratically with proximity, causing the ball to curve naturally around obstacles rather than drive straight into them.' },
      { paragraph: 'Control output flows through an Adaptive PID controller, where the proportional, integral, and derivative terms handle current error, accumulated drift, and oscillation damping respectively. The system auto-tunes its own gains every 60 frames based on actual performance — boosting aggression when sluggish, increasing damping when oscillating. A physics predictor runs in parallel, estimating ball velocity via exponential moving average and feeding a predicted future position into the error signal to compensate for the physical inertia of the ball. All of this is visualized live in a debug overlay showing force vectors, servo angles, speed, and PID state in real time.' },
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
        body: 'The joystick directly maps to servo angles in real time — no computer involvement at all. Analog joystick readings from 0–4095 are mapped linearly to the 0°–180° servo range entirely on the ESP32. This mode is useful for manually navigating the maze, testing the physical range of motion of the platform, and verifying that both axes respond correctly before switching to autonomous modes.'
      },
      {
        number: 'Mode 3 — 3 Clicks',
        title: 'Auto Waypoint',
        body: 'The Python pipeline takes full control. Using the detected ball position, it computes an attraction force directly toward the current waypoint and runs it through the Adaptive PID and physics predictor to generate a servo command each frame. There is no wall avoidance in this mode so the system pulls straight toward each target regardless of what is in between.'
      },
      {
        number: 'Mode 4 — 4 Clicks',
        title: 'Auto Smart',
        body: 'Everything in Auto Waypoint, plus wall repulsion and machine learning path memory. Every time the ball successfully reaches a waypoint, the trajectory is recorded to disk. On subsequent runs, the system retrieves the shortest previously successful path and uses it as intermediate guided targets — the system genuinely improves each run, converging significantly faster after the first exploratory pass.'
      }
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
      { label: 'Why',   text: 'Created during the Hack Canada Hackathon to reconnect amputee or upper-limb disabled patients to computers as simply as a normal Bluetooth mouse would.' },
      { label: 'How',   text: 'An IMU gyroscope measures tilt, while EMG sensors and a button control clicking and freezing. All processed by an ESP32 microcontroller, which wirelessly connects via Bluetooth.' },
      { label: 'Specs', text: 'EMG and IMU controlled. BLE pipeline to the computer. Companion web dashboard for live monitoring of power, sensitivity, and EMG positioning.' }
    ],
    writeup: [
      { heading: 'Jolt' },
      { paragraph: 'Jolt is a wireless, wearable arm sleeve that turns natural arm motion into full computer cursor control. An IMU mounted on the sleeve tracks the orientation and movement of your forearm in real time, translating tilts and gestures into smooth, proportional mouse movement across your screen. No desk, no surface, no traditional mouse required.' },
      { paragraph: 'The hardware is built around an ESP32, which reads data from the IMU and an EMG sensor, then broadcasts wirelessly over Bluetooth, pairing with any computer exactly like a standard Bluetooth mouse. No drivers, no dongles, just a seamless connection. A physical button on the sleeve lets you instantly freeze the cursor and re-zero its position, so you can reposition your arm without sending the pointer flying across the screen. Flexing your forearm triggers the EMG sensor to register a click, keeping the interaction feel intuitive and physical.' },
      { paragraph: 'Alongside the sleeve sits a companion web dashboard where you can monitor and tune the system in real time: adjusting cursor sensitivity, toggling the freeze state, repositioning the EMG sensor\'s reference point, and watching live data from the sensors. Everything that would otherwise require digging into firmware can be controlled from the browser.' }
    ]
  },

  {
    id: 'pcb',
    title: 'Custom EMG Signal Processing PCB',
    subtitle: 'A hardware solution for biopotential data collection and wireless transmission.',
    thumbnail: 'images/schematic.jpg',
    skills: ['KiCad', 'Custom Circuits'],
    // PCB is categorised as collaborative — built for the True North Biocompetition team
    categories: ['collaborative'],
    images: [
      { src: 'images/schematic.jpg', alt: 'PCB Schematic Design' },
      { src: 'images/physical.jpg',  alt: 'Physical PCB Layout' }
    ],
    techSummary: [
      { label: 'Why',            text: 'To reduce signal noise in EMG data collection and create a compact processing system for a wearable diagnostic prosthetic.' },
      { label: 'Specifications', text: 'USB-C powered, 3-channel EMG input, 5V/2.5V/GND rail distribution, and integrated Bluetooth (ESP32) communication.' },
      { label: 'Hardware Stack', text: 'Designed in KiCad; utilizes a Teensy for high-speed ADC and an ESP32 for wireless data transmission.' }
    ],
    writeup: [
      { heading: 'True North Biocompetition' },
      { paragraph: 'Reliable EMG data requires a stable power environment and clean signal routing. This project involved designing a custom 2-layer PCB to bridge the gap between raw analog muscle signals and digital control systems. I produced this board for the True North Biocompetition, in which it will pick up a user\'s muscle data as they wear a leg brace, and export it to an app to track their recovery.' },
      { paragraph: 'The board features a USB-C power input with a filtering circuit to ensure stable voltage across all components. It processes three independent signal lines from EMG sensors through a Teensy microcontroller, leveraging its superior ADC capabilities. The processed data is then handed off to an ESP32, which uses Bluetooth to transmit signals to an outside device with minimal latency.' },
      { paragraph: 'Key design considerations included trace width for power rails, strategic placement of decoupling capacitors to suppress switching noise, and the inclusion of dedicated 5V and 2.5V breakout pins for auxiliary hardware.' }
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
      { paragraph: 'This gallery showcases complex surfacing — such as the jet turbine and organic geometry — alongside high-tolerance mechanical assemblies intended for real-world fabrication.' }
    ]
  },

  {
    id: 'design',
    title: 'Wood Working Design',
    subtitle: 'A collection of custom works exploring wood, metal, and mixed-media fabrication.',
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
      { label: 'Why',      text: 'To experiment with varied materials and fabrication techniques, from subtractive carving to high-heat metalwork.' },
      { label: 'Mediums',  text: 'Hand-carved wood, hammered copper, welded carbon steel, and pyrographed (woodburnt) art pieces.' },
      { label: 'Skillset', text: 'MIG welding, copper annealing, woodcarving, and intricate hand-sketching via woodburning.' }
    ],
    writeup: [
      { heading: 'Material Exploration' },
      { paragraph: 'This personal collection showcases my drive to master the physical properties of diverse materials. Whether it is the delicate subtractive process of a carved tree or the high-heat manipulation required for a welded rail spike cross, each piece represents a unique problem-solving journey.' },
      { paragraph: 'My work includes woodburnt art pieces that require extreme patience and steady hand-control, as well as copper rings formed through repeated annealing and hammering. These projects serve as a playground for technical experimentation, allowing me to develop a tactile understanding of materials that informs my larger-scale engineering designs.' }
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
      { label: 'Why',      text: 'To experiment with varied materials and fabrication techniques, from subtractive carving to high-heat metalwork.' },
      { label: 'Mediums',  text: 'Hand-carved wood, hammered copper, welded carbon steel, and pyrographed (woodburnt) art pieces.' },
      { label: 'Skillset', text: 'MIG welding, copper annealing, woodcarving, and intricate hand-sketching via woodburning.' }
    ],
    writeup: [
      { heading: 'Material Exploration' },
      { paragraph: 'This personal collection showcases my drive to master the physical properties of diverse materials. Whether it is the delicate subtractive process of a carved tree or the high-heat manipulation required for a welded rail spike cross, each piece represents a unique problem-solving journey.' },
      { paragraph: 'My work includes woodburnt art pieces that require extreme patience and steady hand-control, as well as copper rings formed through repeated annealing and hammering. These projects serve as a playground for technical experimentation, allowing me to develop a tactile understanding of materials that informs my larger-scale engineering designs.' }
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
      { label: 'Why',      text: 'To experiment with varied materials and fabrication techniques, from subtractive carving to high-heat metalwork.' },
      { label: 'Mediums',  text: 'Hand-carved wood, hammered copper, welded carbon steel, and pyrographed (woodburnt) art pieces.' },
      { label: 'Skillset', text: 'MIG welding, copper annealing, woodcarving, and intricate hand-sketching via woodburning.' }
    ],
    writeup: [
      { heading: 'Material Exploration' },
      { paragraph: 'This personal collection showcases my drive to master the physical properties of diverse materials. Whether it is the delicate subtractive process of a carved tree or the high-heat manipulation required for a welded rail spike cross, each piece represents a unique problem-solving journey.' },
      { paragraph: 'My work includes woodburnt art pieces that require extreme patience and steady hand-control, as well as copper rings formed through repeated annealing and hammering. These projects serve as a playground for technical experimentation, allowing me to develop a tactile understanding of materials that informs my larger-scale engineering designs.' }
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
      { label: 'Specs', text: 'Custom-fitted socket designed for pressure distribution and fine motor task optimization.' }
    ],
    writeup: [
      { heading: 'Human-Centered Engineering' },
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
      { paragraph: 'This project involved dozens of 3D-printed iterations to balance grip force with lightweight wearability. The EMG integration allows the device to amplify the user\'s natural intent into functional mechanical force.' }
    ]
  }
];
