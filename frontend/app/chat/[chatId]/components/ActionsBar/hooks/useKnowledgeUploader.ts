/* eslint-disable max-lines */
import axios from "axios";
import { UUID } from "crypto";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { useChatApi } from "@/lib/api/chat/useChatApi";
import { useCrawlApi } from "@/lib/api/crawl/useCrawlApi";
import { useUploadApi } from "@/lib/api/upload/useUploadApi";
import { useBrainContext } from "@/lib/context/BrainProvider/hooks/useBrainContext";
import { useToast } from "@/lib/hooks";

import { FeedItemCrawlType, FeedItemType, FeedItemUploadType } from "../types";

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const useKnowledgeUploader = () => {
  const [contents, setContents] = useState<FeedItemType[]>([]);
  const { publish } = useToast();
  const { uploadFile } = useUploadApi();
  const { t } = useTranslation(["upload"]);
  const { crawlWebsiteUrl } = useCrawlApi();
  const { createChat } = useChatApi();

  const params = useParams();
  const chatId = params?.chatId as UUID | undefined;

  const { currentBrainId } = useBrainContext();
  const addContent = (content: FeedItemType) => {
    setContents((prevContents) => [...prevContents, content]);
  };
  const removeContent = (index: number) => {
    setContents((prevContents) => prevContents.filter((_, i) => i !== index));
  };

  const crawlWebsiteHandler = useCallback(
    async (url: string, brainId: UUID, chat_id: UUID) => {
      // Configure parameters
      const config = {
        url: url,
        js: false,
        depth: 1,
        max_pages: 100,
        max_time: 60,
      };

      try {
        await crawlWebsiteUrl({
          brainId,
          config,
          chat_id,
        });
      } catch (error: unknown) {
        publish({
          variant: "danger",
          text: t("crawlFailed", {
            message: JSON.stringify(error),
          }),
        });
      }
    },
    [crawlWebsiteUrl, publish, t]
  );

  const uploadFileHandler = useCallback(
    async (file: File, brainId: UUID, chat_id: UUID) => {
      const formData = new FormData();
      formData.append("uploadFile", file);
      try {
        await uploadFile({
          brainId,
          formData,
          chat_id,
        });
      } catch (e: unknown) {
        if (axios.isAxiosError(e) && e.response?.status === 403) {
          publish({
            variant: "danger",
            text: `${JSON.stringify(
              (
                e.response as {
                  data: { detail: string };
                }
              ).data.detail
            )}`,
          });
        } else {
          publish({
            variant: "danger",
            text: t("error", { message: e }),
          });
        }
      }
    },
    [publish, t, uploadFile]
  );

  const files: File[] = (
    contents.filter((c) => c.source === "upload") as FeedItemUploadType[]
  ).map((c) => c.file);

  const urls: string[] = (
    contents.filter((c) => c.source === "crawl") as FeedItemCrawlType[]
  ).map((c) => c.url);

  const feedBrain = async (): Promise<void> => {
    if (currentBrainId === null) {
      publish({
        variant: "danger",
        text: t("selectBrainFirst"),
      });

      return;
    }

    try {
      const currentChatId = chatId ?? (await createChat("New Chat")).chat_id;
      const uploadPromises = files.map((file) =>
        uploadFileHandler(file, currentBrainId, currentChatId)
      );
      const crawlPromises = urls.map((url) =>
        crawlWebsiteHandler(url, currentBrainId, currentChatId)
      );

      await Promise.all([...uploadPromises, ...crawlPromises]);

      setContents([]);

      publish({
        variant: "success",
        text: t("knowledgeUploaded"),
      });
    } catch (e) {
      publish({
        variant: "danger",
        text: JSON.stringify(e),
      });
    }
  };

  return {
    addContent,
    contents,
    removeContent,
    feedBrain,
  };
};
