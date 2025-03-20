import { nanoid } from "nanoid";
import React, { useEffect, useState, useRef, useCallback, Children, cloneElement } from "react";

import type * as TExcalidraw from "@excalidraw/excalidraw";
import type { ImportedLibraryData } from "@excalidraw/excalidraw/data/types";
import type { NonDeletedExcalidrawElement, Theme } from "@excalidraw/excalidraw/element/types";
import type {
    AppState,
    BinaryFileData,
    ExcalidrawImperativeAPI,
    ExcalidrawInitialDataState,
    Gesture,
    LibraryItems,
    PointerDownState as ExcalidrawPointerDownState,
} from "@excalidraw/excalidraw/types";

import initialData from "./initialDate";
import { resolvablePromise, distance2d, fileOpen, withBatchedUpdates, withBatchedUpdatesThrottled } from "./utils";

import "./ExampleApp.scss";

import type { ResolvablePromise } from "./utils";

type Comment = {
    x: number;
    y: number;
    value: string;
    id?: string;
};

type PointerDownState = {
    x: number;
    y: number;
    hitElement: Comment;
    onMove: any;
    onUp: any;
    hitElementOffsets: {
        x: number;
        y: number;
    };
};

const COMMENT_ICON_DIMENSION = 32;
const COMMENT_INPUT_HEIGHT = 50;
const COMMENT_INPUT_WIDTH = 150;

export interface AppProps {
    appTitle: string;
    useCustom: (api: ExcalidrawImperativeAPI | null, customArgs?: any[]) => void;
    customArgs?: any[];
    children: React.ReactNode;
    excalidrawLib: typeof TExcalidraw;
}

export default function ExampleApp({ appTitle, useCustom, customArgs, children, excalidrawLib }: AppProps) {
    const {
        exportToBlob,
        useHandleLibrary,
        MIME_TYPES,
        sceneCoordsToViewportCoords,
        viewportCoordsToSceneCoords,
        restoreElements,
        Footer,
        MainMenu,
        LiveCollaborationTrigger,
        convertToExcalidrawElements, // конертирует картинку в канвас
        TTDDialog,
        TTDDialogTrigger,
        ROUNDNESS,
        loadSceneOrLibraryFromBlob,
    } = excalidrawLib;
    const appRef = useRef<any>(null);

    const [blobUrl, setBlobUrl] = useState<string>("");
    const [exportWithDarkMode, setExportWithDarkMode] = useState(false);
    const [exportEmbedScene, setExportEmbedScene] = useState(false);
    const [theme, setTheme] = useState<Theme>("light");
    const [disableImageTool, setDisableImageTool] = useState(false);
    const [isCollaborating, setIsCollaborating] = useState(false);
    const [commentIcons, setCommentIcons] = useState<{ [id: string]: Comment }>({});
    const [comment, setComment] = useState<Comment | null>(null);

    const initialStatePromiseRef = useRef<{
        promise: ResolvablePromise<ExcalidrawInitialDataState | null>;
    }>({ promise: null! });
    if (!initialStatePromiseRef.current.promise) {
        initialStatePromiseRef.current.promise = resolvablePromise<ExcalidrawInitialDataState | null>();
    }

    const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);

    useCustom(excalidrawAPI, customArgs);

    useHandleLibrary({ excalidrawAPI });

    useEffect(() => {
        if (!excalidrawAPI) {
            return;
        }
        const fetchData = async () => {
            const res = await fetch("/images/rocket.jpeg");
            const imageData = await res.blob();
            const reader = new FileReader();
            reader.readAsDataURL(imageData);

            reader.onload = function () {
                const imagesArray: BinaryFileData[] = [
                    {
                        id: "rocket" as BinaryFileData["id"],
                        dataURL: reader.result as BinaryFileData["dataURL"],
                        mimeType: MIME_TYPES.jpg,
                        created: 1644915140367,
                        lastRetrieved: 1644915140367,
                    },
                ];

                //@ts-ignore
                initialStatePromiseRef.current.promise.resolve({
                    ...initialData,
                    elements: convertToExcalidrawElements(initialData.elements),
                });
                excalidrawAPI.addFiles(imagesArray);
            };
        };
        fetchData();
    }, [excalidrawAPI, convertToExcalidrawElements, MIME_TYPES]);

    const renderExcalidraw = (children: React.ReactNode) => {
        const Excalidraw: any = Children.toArray(children).find(
            (child) =>
                React.isValidElement(child) &&
                typeof child.type !== "string" &&
                //@ts-ignore
                child.type.displayName === "Excalidraw"
        );
        if (!Excalidraw) {
            return;
        }
        const newElement = cloneElement(
            Excalidraw,
            {
                excalidrawAPI: (api: ExcalidrawImperativeAPI) => setExcalidrawAPI(api),
                initialData: initialStatePromiseRef.current.promise,
                onChange: (elements: NonDeletedExcalidrawElement[], state: AppState) => {
                    console.info("Elements :", elements, "State : ", state);
                },
                onPointerUpdate: (payload: { pointer: { x: number; y: number }; button: "down" | "up"; pointersMap: Gesture["pointers"] }) =>
                    setPointerData(payload),

                theme,
                name: "Custom name of drawing",
                UIOptions: {
                    canvasActions: {
                        loadScene: false,
                    },
                    tools: { image: !disableImageTool },
                },
                onLinkOpen,
                onPointerDown,
                onScrollChange: rerenderCommentIcons,
                validateEmbeddable: true,
            },
            <>
                {excalidrawAPI && <Footer></Footer>}

                {renderMenu()}
                {excalidrawAPI && <TTDDialogTrigger icon={<span>😀</span>}>Text to diagram</TTDDialogTrigger>}
                <TTDDialog
                    onTextSubmit={async (_) => {
                        console.info("submit");
                        // sleep for 2s
                        await new Promise((resolve) => setTimeout(resolve, 2000));
                        throw new Error("error, go away now");
                        // return "dummy";
                    }}
                />
            </>
        );
        return newElement;
    };
    

    const loadSceneOrLibrary = async () => {
        const file = await fileOpen({ description: "Excalidraw or library file" });
        const contents = await loadSceneOrLibraryFromBlob(file, null, null);
        if (contents.type === MIME_TYPES.excalidraw) {
            excalidrawAPI?.updateScene(contents.data as any);
        } else if (contents.type === MIME_TYPES.excalidrawlib) {
            excalidrawAPI?.updateLibrary({
                libraryItems: (contents.data as ImportedLibraryData).libraryItems!,
                openLibraryMenu: true,
            });
        }
    };
    //кнопка updateScene
    const updateScene = () => {
        const sceneData = {
            elements: restoreElements(
                convertToExcalidrawElements([
                    {
                        type: "rectangle",
                        id: "rect-1",
                        fillStyle: "hachure",
                        strokeWidth: 1,
                        strokeStyle: "solid",
                        roughness: 1,
                        angle: 0,
                        x: 100.50390625,
                        y: 93.67578125,
                        strokeColor: "#279c31",
                        width: 186.47265625,
                        height: 141.9765625,
                        seed: 1968410350,
                        roundness: {
                            type: ROUNDNESS.ADAPTIVE_RADIUS,
                            value: 32,
                        },
                    },
                    {
                        type: "arrow",
                        x: 300,
                        y: 150,
                        start: { id: "rect-1" },
                        end: { type: "ellipse" },
                    },
                    {
                        type: "text",
                        x: 300,
                        y: 100,
                        text: "HELLO ЦЦЦЦЦЦЫ!",
                    },
                ]),
                null
            ),
            appState: {
                viewBackgroundColor: "#edf2ff",
            },
        };
        excalidrawAPI?.updateScene(sceneData);
    };

    const onLinkOpen = useCallback(
        (
            element: NonDeletedExcalidrawElement,
            event: CustomEvent<{
                nativeEvent: MouseEvent | React.PointerEvent<HTMLCanvasElement>;
            }>
        ) => {
            const link = element.link!;
            const { nativeEvent } = event.detail;
            const isNewTab = nativeEvent.ctrlKey || nativeEvent.metaKey;
            const isNewWindow = nativeEvent.shiftKey;
            const isInternalLink = link.startsWith("/") || link.includes(window.location.origin);
            if (isInternalLink && !isNewTab && !isNewWindow) {
                // signal that we're handling the redirect ourselves
                event.preventDefault();
                // do a custom redirect, such as passing to react-router
                // ...
            }
        },
        []
    );

    const [pointerData, setPointerData] = useState<{
        pointer: { x: number; y: number };
        button: "down" | "up";
        pointersMap: Gesture["pointers"];
    } | null>(null);

    const onPointerDown = (activeTool: AppState["activeTool"], pointerDownState: ExcalidrawPointerDownState) => {
        if (activeTool.type === "custom" && activeTool.customType === "comment") {
            const { x, y } = pointerDownState.origin;
            setComment({ x, y, value: "" });
        }
    };

    const rerenderCommentIcons = () => {
        if (!excalidrawAPI) {
            return false;
        }
        const commentIconsElements = appRef.current.querySelectorAll(".comment-icon") as HTMLElement[];
        commentIconsElements.forEach((ele) => {
            const id = ele.id;
            const appstate = excalidrawAPI.getAppState();
            const { x, y } = sceneCoordsToViewportCoords({ sceneX: commentIcons[id].x, sceneY: commentIcons[id].y }, appstate);
            ele.style.left = `${x - COMMENT_ICON_DIMENSION / 2 - appstate!.offsetLeft}px`;
            ele.style.top = `${y - COMMENT_ICON_DIMENSION / 2 - appstate!.offsetTop}px`;
        });
    };

    const onPointerMoveFromPointerDownHandler = (pointerDownState: PointerDownState) => {
        return withBatchedUpdatesThrottled((event: any) => {
            if (!excalidrawAPI) {
                return false;
            }
            const { x, y } = viewportCoordsToSceneCoords(
                {
                    clientX: event.clientX - pointerDownState.hitElementOffsets.x,
                    clientY: event.clientY - pointerDownState.hitElementOffsets.y,
                },
                excalidrawAPI.getAppState()
            );
            setCommentIcons({
                ...commentIcons,
                [pointerDownState.hitElement.id!]: {
                    ...commentIcons[pointerDownState.hitElement.id!],
                    x,
                    y,
                },
            });
        });
    };
    const onPointerUpFromPointerDownHandler = (pointerDownState: PointerDownState) => {
        return withBatchedUpdates((event: any) => {
            window.removeEventListener("pointermove", pointerDownState.onMove);
            window.removeEventListener("pointerup", pointerDownState.onUp);
            excalidrawAPI?.setActiveTool({ type: "selection" });
            const distance = distance2d(pointerDownState.x, pointerDownState.y, event.clientX, event.clientY);
            if (distance === 0) {
                if (!comment) {
                    setComment({
                        x: pointerDownState.hitElement.x + 60,
                        y: pointerDownState.hitElement.y,
                        value: pointerDownState.hitElement.value,
                        id: pointerDownState.hitElement.id,
                    });
                } else {
                    setComment(null);
                }
            }
        });
    };

    const renderCommentIcons = () => {
        return Object.values(commentIcons).map((commentIcon) => {
            if (!excalidrawAPI) {
                return false;
            }
            const appState = excalidrawAPI.getAppState();
            const { x, y } = sceneCoordsToViewportCoords({ sceneX: commentIcon.x, sceneY: commentIcon.y }, excalidrawAPI.getAppState());
            return (
                <div
                    id={commentIcon.id}
                    key={commentIcon.id}
                    style={{
                        top: `${y - COMMENT_ICON_DIMENSION / 2 - appState!.offsetTop}px`,
                        left: `${x - COMMENT_ICON_DIMENSION / 2 - appState!.offsetLeft}px`,
                        position: "absolute",
                        zIndex: 1,
                        width: `${COMMENT_ICON_DIMENSION}px`,
                        height: `${COMMENT_ICON_DIMENSION}px`,
                        cursor: "pointer",
                        touchAction: "none",
                    }}
                    className="comment-icon"
                    onPointerDown={(event) => {
                        event.preventDefault();
                        if (comment) {
                            commentIcon.value = comment.value;
                            saveComment();
                        }
                        const pointerDownState: any = {
                            x: event.clientX,
                            y: event.clientY,
                            hitElement: commentIcon,
                            hitElementOffsets: { x: event.clientX - x, y: event.clientY - y },
                        };
                        const onPointerMove = onPointerMoveFromPointerDownHandler(pointerDownState);
                        const onPointerUp = onPointerUpFromPointerDownHandler(pointerDownState);
                        window.addEventListener("pointermove", onPointerMove);
                        window.addEventListener("pointerup", onPointerUp);

                        pointerDownState.onMove = onPointerMove;
                        pointerDownState.onUp = onPointerUp;

                        excalidrawAPI?.setActiveTool({
                            type: "custom",
                            customType: "comment",
                        });
                    }}
                >
                    <div className="comment-avatar">
                        <img src="images/doremon.png" alt="doremon" />
                    </div>
                </div>
            );
        });
    };

    const saveComment = () => {
        if (!comment) {
            return;
        }
        if (!comment.id && !comment.value) {
            setComment(null);
            return;
        }
        const id = comment.id || nanoid();
        setCommentIcons({
            ...commentIcons,
            [id]: {
                x: comment.id ? comment.x - 60 : comment.x,
                y: comment.y,
                id,
                value: comment.value,
            },
        });
        setComment(null);
    };

    const renderComment = () => {
        if (!comment) {
            return null;
        }
        const appState = excalidrawAPI?.getAppState()!;
        const { x, y } = sceneCoordsToViewportCoords({ sceneX: comment.x, sceneY: comment.y }, appState);
        let top = y - COMMENT_ICON_DIMENSION / 2 - appState.offsetTop;
        let left = x - COMMENT_ICON_DIMENSION / 2 - appState.offsetLeft;

        if (top + COMMENT_INPUT_HEIGHT < appState.offsetTop + COMMENT_INPUT_HEIGHT) {
            top = COMMENT_ICON_DIMENSION / 2;
        }
        if (top + COMMENT_INPUT_HEIGHT > appState.height) {
            top = appState.height - COMMENT_INPUT_HEIGHT - COMMENT_ICON_DIMENSION / 2;
        }
        if (left + COMMENT_INPUT_WIDTH < appState.offsetLeft + COMMENT_INPUT_WIDTH) {
            left = COMMENT_ICON_DIMENSION / 2;
        }
        if (left + COMMENT_INPUT_WIDTH > appState.width) {
            left = appState.width - COMMENT_INPUT_WIDTH - COMMENT_ICON_DIMENSION / 2;
        }

        return (
            <textarea
                className="comment"
                style={{
                    top: `${top}px`,
                    left: `${left}px`,
                    position: "absolute",
                    zIndex: 1,
                    height: `${COMMENT_INPUT_HEIGHT}px`,
                    width: `${COMMENT_INPUT_WIDTH}px`,
                }}
                ref={(ref) => {
                    setTimeout(() => ref?.focus());
                }}
                placeholder={comment.value ? "Reply" : "Comment"}
                value={comment.value}
                onChange={(event) => {
                    setComment({ ...comment, value: event.target.value });
                }}
                onBlur={saveComment}
                onKeyDown={(event) => {
                    if (!event.shiftKey && event.key === "Enter") {
                        event.preventDefault();
                        saveComment();
                    }
                }}
            />
        );
    };

    const renderMenu = () => {
        return (
            <MainMenu>
                <MainMenu.DefaultItems.SaveAsImage />
                <MainMenu.DefaultItems.Export />
                {/* <MainMenu.Separator />
                <MainMenu.DefaultItems.LiveCollaborationTrigger
                    isCollaborating={isCollaborating}
                    onSelect={() => window.alert("You clicked on collab button")}
                /> */}
                {/* <MainMenu.Group title="Excalidraw links">
                    <MainMenu.DefaultItems.Socials />
                </MainMenu.Group> */}
                {/* <MainMenu.Separator />
                <MainMenu.ItemCustom>
                    <button style={{ height: "2rem" }} onClick={() => window.alert("custom menu item")}>
                        custom item
                    </button>
                </MainMenu.ItemCustom>
                <MainMenu.DefaultItems.Help />

                {excalidrawAPI && <MobileFooter excalidrawLib={excalidrawLib} excalidrawAPI={excalidrawAPI} />} */}
            </MainMenu>
        );
    };

    return (
        <div className="App" ref={appRef}>
            <h1>{appTitle}</h1>
            <div className="button-wrapper">
                {/* <button onClick={loadSceneOrLibrary}>Load Scene or Library</button> */}
                {/* <button className="update-scene" onClick={updateScene}>
                    Update Scene
                </button> */}
                <button
                    className="reset-scene"
                    onClick={() => {
                        excalidrawAPI?.resetScene();
                    }}
                >
                    Reset Scene
                </button>
                <button
                    onClick={() => {
                        const libraryItems: LibraryItems = [
                            {
                                status: "published",
                                id: "1",
                                created: 1,
                                elements: initialData.libraryItems[1] as any,
                            },
                            {
                                status: "unpublished",
                                id: "2",
                                created: 2,
                                elements: initialData.libraryItems[1] as any,
                            },
                        ];
                        excalidrawAPI?.updateLibrary({
                            libraryItems,
                        });
                    }}
                >
                    Update Library
                </button>
            </div>
            <div className="excalidraw-wrapper">
                {renderExcalidraw(children)}
                {Object.keys(commentIcons || []).length > 0 && renderCommentIcons()}
                {comment && renderComment()}
            </div>

            <div className="export-wrapper button-wrapper">
                <label className="export-wrapper__checkbox">
                    <input type="checkbox" checked={exportWithDarkMode} onChange={() => setExportWithDarkMode(!exportWithDarkMode)} />
                    Export with dark mode
                </label>
                <label className="export-wrapper__checkbox">
                    <input type="checkbox" checked={exportEmbedScene} onChange={() => setExportEmbedScene(!exportEmbedScene)} />
                    Export with embed scene
                </label>

                <button
                    onClick={async () => {
                        if (!excalidrawAPI) {
                            return;
                        }
                        const blob = await exportToBlob({
                            elements: excalidrawAPI?.getSceneElements(),
                            mimeType: "image/png",
                            appState: {
                                ...initialData.appState,
                                exportEmbedScene,
                                exportWithDarkMode,
                            },
                            files: excalidrawAPI?.getFiles(),
                        });
                        setBlobUrl(window.URL.createObjectURL(blob));
                    }}
                >
                    Export to IMG
                </button>
                <div className="export export-blob">
                    <img src={blobUrl} alt="" />
                </div>
            </div>
        </div>
    );
}
