<script setup>
    import Loader from './components/Loader.vue';
    import Button from './components/Button.vue';

    import mimeDb from 'mime-db';
    import Konva from 'konva';
    import heic2any from 'heic2any';
    import canvasSize from 'canvas-size';

    import { buildDetector } from './model.ts';

    import * as faceapi from 'face-api.js';

    import { useImage } from 'vue-konva';
    import { computed, ref, useTemplateRef, watch, nextTick, onMounted, onUpdated, onUnmounted, shallowRef } from 'vue';

    const defaultPixelRatio = Konva.pixelRatio;

    const isLoading = ref(true);
    const loadingText = ref(null);
    
    const infoBoxText = ref(null);

    const imageMimeType = ref(null);

    const maxCanvasSize = ref(null);

    const isDisabledFacesDetection = ref(false);
    const fileName = ref('stage');
    const imageNode = ref(null);
    const facesImageNodeRefs = useTemplateRef('facesImageNode');
    const image = ref(null);
    const imageFilters = ref({
      blur: { active: false },
      invert: { active: false },
      pixelate: { active: false, pixelSize: 8 },
    });
    const facesFilters = ref({
      blur: { active: false },
      invert: { active: false },
      pixelate: { active: false, pixelSize: 8 },
    });

    const cropConfigs = ref(null);

    const containerRef = ref(null);
    const stageRef = ref(null);

    const scale = ref(1);
    const stageWidth = ref(400);  // TODO: Default value + resize event not working
    const stageHeight = ref(600);

    const imageWidth = ref(null);
    const imageHeight = ref(null);

    const detector = shallowRef(null);

    const updateSize = () => {
      if (!containerRef.value) {  // TODO
        return;
      }
      
      // Get container width
      const containerWidth = containerRef.value.offsetWidth;
      const containerHeight = containerRef.value.offsetHeight;

      let scalingFactor = containerWidth / stageWidth.value;
      let newStageHeight = stageHeight.value * scalingFactor;
      let newStageWidth = containerWidth;

      scale.value *= scalingFactor;
      stageWidth.value = newStageWidth;
      stageHeight.value = newStageHeight;
    };

    // Add event listeners
    onMounted(async () => {
      updateSize();
      window.addEventListener('resize', updateSize);
      detector.value = await buildDetector();
      isLoading.value = false;
    });

    // Clean up
    onUnmounted(() => {
      window.removeEventListener('resize', updateSize);
    });

    const activeAllImageFilters = computed(() => {
        const active = [];
        if (imageFilters.value.blur.active) {
            active.push(Konva.Filters.Blur);
        }
        if (imageFilters.value.pixelate.active) {
            active.push(Konva.Filters.Pixelate);
        }
        if (imageFilters.value.invert.active) {
            active.push(Konva.Filters.Invert);
        }
        return active;
    });

    const activeFacesFilters = computed(() => {
        const active = [...activeAllImageFilters.value];
        if (facesFilters.value.blur.active) {
            active.push(Konva.Filters.Blur);
        }
        if (facesFilters.value.pixelate.active) {
            active.push(Konva.Filters.Pixelate);
        }
        if (facesFilters.value.invert.active) {
            active.push(Konva.Filters.Invert);
        }
        return active;
    });

    async function detectFaces() {
        if (cropConfigs.value !== null) {
            facesFilters.value.pixelate.active = !facesFilters.value.pixelate.active;
            return;
        }
        isDisabledFacesDetection.value = true;

        const faces = await faceapi.detectAllFaces(image.value)

        let maxWidth = 0;
        let maxHeight = 0;
        if (faces.length > 0) {
            const newCropConfigs = []

            for (let face of faces) {
                let x = face._box._x;
                let y = face._box._y;
                let width = face._box._width;
                let height = face._box._height;

                // Set crop configuration
                newCropConfigs.push({
                  // Even though it might seem redundant, everything is required in here.
                  displayX: x,
                  displayY: y,
                  displayWidth: width,
                  displayHeight: height,
                  x: x,
                  y: y,
                  width: width,
                  height: height,
                })
                
                if (width > maxWidth) {
                    maxWidth = width;
                }
                if (height > maxHeight) {
                    maxHeight = height;
                }
            }

            cropConfigs.value = newCropConfigs;
            await nextTick();
            
            for (let faceImageNodeRef of facesImageNodeRefs.value) {
                faceImageNodeRef.getNode().cache();
            }

            // Enable filter on faces
            facesFilters.value.pixelate.active = true;
            facesFilters.value.pixelate.pixelSize = Math.max(maxWidth / 10, maxHeight / 10) * Konva.pixelRatio;
        }

        isDisabledFacesDetection.value = false;
    }

    function setFacesImageNodeRef(el) {
        if (el) {
            facesImageNodeRefs.value.push(el);
        }
    }
        
    async function handleFileSelect(e) {
      const input = e.target;  
      const filesAsArray = Array.from(input?.files || []);

      if (maxCanvasSize.value === null) {
        // TODO: Preload this
        maxCanvasSize.value = await canvasSize.maxArea({
          useWorker: true,
          onError(results) {
            throw new Error(`Unable to determine maximum canvas size: ${JSON.stringify(results)}.`);
          },
        });
      }

      for (const file of filesAsArray) {
          let maybeConvertedBlob = file;
          imageMimeType.value = file.type;

          if (file.type == 'image/heif') {
              isLoading.value = true;
              loadingText.value = 'Converting HEIC image to a browser-supported format…'
              maybeConvertedBlob = await heic2any({
                  blob: file,
                  toType: 'image/jpeg',
                  quality: 0.9
              })
              imageMimeType.value = 'image/jpeg';
          }

          const reader = new FileReader();
          reader.onload = function (ev) {
              let newImage = new Image();
              newImage.onload = () => {
                 Konva.pixelRatio = defaultPixelRatio;
                 while (newImage.width * newImage.height * Konva.pixelRatio * Konva.pixelRatio > maxCanvasSize.value.width * maxCanvasSize.value.height) {
                    console.log('Image is too large, reducing pixel ratio.');
                    Konva.pixelRatio -= 1;

                    if (Konva.pixelRatio <= 0) {
                        throw new Error('Image is too large to be loaded in browser');
                    }
                 }
                 /*if (Konva.pixelRatio != defaultPixelRatio) {
                   infoBoxText.value = 'Image preview might appear blurry to preserve performances. Downloaded image will have the same quality as the input image.';
                 } else {
                   infoBoxText.value = null;
                 }*/

                 fileName.value = file.name;
                 image.value = newImage;
                 isLoading.value = false;
              };
              newImage.src = ev.target.result;
          }
          reader.readAsDataURL(maybeConvertedBlob);
      }
    }

    watch(image, async (newImage) => {
      if (!newImage) {
        return;
      }
      let scalingFactor = stageWidth.value / newImage.width;

      stageWidth.value = newImage.width * scalingFactor;
      stageHeight.value = newImage.height * scalingFactor;

      imageHeight.value = newImage.height;
      imageWidth.value = newImage.width;

      scale.value = scalingFactor;

      await nextTick();
      imageNode.value.getNode().cache();

      // Disable anti-aliasing
      if (Konva.pixelRatio != defaultPixelRatio) {
          // See https://github.com/konvajs/konva/issues/306
          const nativeCtx = imageNode.value.getNode().getLayer().getContext()._context;
          nativeCtx.webkitImageSmoothingEnabled = false;
          nativeCtx.mozImageSmoothingEnabled = false;
          nativeCtx.imageSmoothingEnabled = false;
      }
    });

    function reset() {
        imageNode.value = null;
        facesImageNodeRefs.value = [];
        image.value = null;

        imageFilters.value.blur.active = false;
        imageFilters.value.invert.active = false;
        imageFilters.value.pixelate.active = false;

        facesFilters.value.blur.active = false;
        facesFilters.value.invert.active = false;
        facesFilters.value.pixelate.active = false;

        cropConfigs.value = null;

        Konva.pixelRatio = defaultPixelRatio;
        infoBoxText.value = null;
    }

    async function handleExport() {
      const splitFilename = fileName.value.split('.');
      splitFilename.pop();  // Drop extension
      const downloadFilename = `${splitFilename.join('.')}-edited`;

      try {
        const blob = await stageRef.value.getNode().toBlob({
            pixelRatio: 1 / scale.value,
            mimeType: imageMimeType.value,
        });
        const data = {
          files: [
            new File([blob], `${downloadFilename}.${mimeDb[imageMimeType.value]}`, {
              type: imageMimeType.value,
            }),
          ],
          title: "TODO",  // TODO
          text: "TODO",  // TODO
        };

        if (!navigator.canShare || !navigator.canShare(data)) {
          throw Error('Share APIs not supported in browser');
        }
        await navigator.share(data);
      } catch (err) {
        const dataURL = stageRef.value.getNode().toDataURL({
            pixelRatio: 1 / scale.value,
            mimeType: imageMimeType.value,
        });

        const link = document.createElement('a');
        link.download = downloadFilename;
        link.href = dataURL;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } 
    };
</script>

<template>
    <div class="bg-white w-full max-w-5xl mx-auto p-8 rounded shadow-md">
        <h1 class="text-3xl font-bold text-center mb-8">Quick edit</h1>

        <div class="flex items-center bg-blue-500 text-white text-sm font-bold px-4 py-3 my-3" role="alert" v-if="infoBoxText">
            <!-- TODO: Larger icon with long text on mobile -->
            <svg class="fill-current w-4 h-4 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M12.432 0c1.34 0 2.01.912 2.01 1.957 0 1.305-1.164 2.512-2.679 2.512-1.269 0-2.009-.75-1.974-1.99C9.789 1.436 10.67 0 12.432 0zM8.309 20c-1.058 0-1.833-.652-1.093-3.524l1.214-5.092c.211-.814.246-1.141 0-1.141-.317 0-1.689.562-2.502 1.117l-.528-.88c2.572-2.186 5.531-3.467 6.801-3.467 1.057 0 1.233 1.273.705 3.23l-1.391 5.352c-.246.945-.141 1.271.106 1.271.317 0 1.357-.392 2.379-1.207l.6.814C12.098 19.02 9.365 20 8.309 20z"/></svg>
            <p>{{ infoBoxText }}</p>
        </div>

        <Loader v-if="isLoading" :text="loadingText" />
        <div class="grid grid-cols-2 gap-8" v-else>
            <!-- Image Preview -->
            <div :class="'col-span-2 md:col-span-1 items-center justify-center' + (image === null ? ' border border-dashed border-gray-300 rounded-md h-80 bg-gray-50' : '')" :style="{height: stageHeight + 'px'}">
                <div ref="containerRef" class="w-full h-full">
                    <span class="text-gray-400 block text-center" v-if="!image">No image uploaded</span>
                    <v-stage v-if="image" ref="stageRef" :config="{width: stageWidth, height: stageHeight, scaleX: scale, scaleY: scale}">
                        <v-layer ref="layerRef">
                            <!-- Full image (no filter) -->
                            <v-image
                                v-if="image"
                                ref="imageNode"
                                :image="image"
                                :x="0"
                                :y="0"
                                :width="imageWidth"
                                :height="imageHeight"
                                :draggable="false"
                                :filters="activeAllImageFilters"
                                :pixelSize="imageFilters.pixelate.pixelSize"
                            />
                        </v-layer>
                        <v-layer>
                            <!-- Cropped faces from the image (filter) applied -->
                            <v-image
                                v-for="cropConfig in cropConfigs"
                                ref="facesImageNode"
                                :x="cropConfig.displayX"
                                :y="cropConfig.displayY"
                                :width="cropConfig.displayWidth"
                                :height="cropConfig.displayHeight"
                                :crop="{ x: cropConfig.x, y: cropConfig.y, width: cropConfig.width, height: cropConfig.height }"
                                :image="image"
                                :draggable="false"
                                :filters="activeFacesFilters"
                                :pixelSize="facesFilters.pixelate.pixelSize"
                            />
                        </v-layer>
                    </v-stage>
                </div>
            </div>

            <!-- Controls -->
            <div id="controls" class="col-span-2 md:col-span-1 space-y-6">
                <!-- Buttons -->
                <form class="px-8 pt-6 pb-8 mb-4" v-if="!image">
                    <div class="mb-4">
                        <label class="block font-medium mb-2" for="upload">Upload Image</label>
                        <input type="file" @change="handleFileSelect" id="upload" accept="image/*" class="cursor-pointer block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" required />
                    </div>
                </form>
                <div class="space-y-6" v-else>
                    <div>
                        <h2>Blur:</h2>
                        <!-- TODO: Loading spinner + disabled status -->
                        <Button :action="detectFaces" :active="facesFilters.pixelate.active" label="Blur faces"/>

                        <h2>Effects:</h2>
                        <!-- TODO: Image mode: B&W / colors -->
                        <Button :action="() => {imageFilters.invert.active = !imageFilters.invert.active}" :active="imageFilters.invert.active" label="Negative" />
                    </div>

                    <div class="grid grid-cols-2" v-if="image">
                        <button @click="handleExport" class="cursor-pointer bg-blue-500 text-white py-2 px-4 mr-4 rounded hover:bg-blue-600">Download</button>

                        <button @click="reset" class="cursor-pointer bg-red-500 text-white py-2 px-4 ml-4 rounded hover:bg-red-600">Cancel</button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
#controls {
    z-index: 9999;
}
</style>
