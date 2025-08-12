// Rotate the screen to the whichever way has the longest edge

class AutoRotate {
    constructor(element) {
        this.element = element;
        this.currentRotation = 0;
        this.init();
    }

    init() {
        // Apply initial rotation based on current dimensions
        this.rotateToWidest();
        
        // Listen for window resize events to re-evaluate rotation
        window.addEventListener('resize', () => {
            this.rotateToWidest();
        });

        // Listen for orientation change events on mobile devices
        window.addEventListener('orientationchange', () => {
            // Small delay to allow the orientation change to complete
            setTimeout(() => {
                this.rotateToWidest();
            }, 100);
        });
    }

    rotateToWidest() {
        const rect = this.element.getBoundingClientRect();
        const isCurrentlyWider = rect.width > rect.height;
        const windowIsWider = window.innerWidth > window.innerHeight;

        // Determine if we need to rotate
        let targetRotation = 0;
        
        if (windowIsWider && !isCurrentlyWider) {
            // Window is wider but element is taller - rotate 90 degrees
            targetRotation = 90;
        } else if (!windowIsWider && isCurrentlyWider) {
            // Window is taller but element is wider - rotate to fit
            targetRotation = 90;
        }

        // Apply rotation if different from current
        if (targetRotation !== this.currentRotation) {
            this.currentRotation = targetRotation;
            this.applyRotation();
        }
    }

    applyRotation() {
        const transform = `rotate(${this.currentRotation}deg)`;
        this.element.style.transform = transform;
        this.element.style.transformOrigin = 'center center';
        
        // Ensure the element maintains its layout
        if (this.currentRotation === 90 || this.currentRotation === 270) {
            // When rotated 90 degrees, we might need to adjust positioning
            this.element.style.transformOrigin = 'center center';
        }
    }

    // Method to manually set rotation
    setRotation(degrees) {
        this.currentRotation = degrees;
        this.applyRotation();
    }

    // Method to get current rotation
    getRotation() {
        return this.currentRotation;
    }

    // Method to destroy the auto-rotate functionality
    disconnectedCallback() {
        window.removeEventListener('resize', this.rotateToWidest);
        window.removeEventListener('orientationchange', this.rotateToWidest);
        this.element.style.transform = '';
        this.element.style.transformOrigin = '';
    }
}

window.defineTrait('auto-rotate', AutoRotate);
