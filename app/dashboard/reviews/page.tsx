"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ExternalLink,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getReviews } from "@/module/review/actions";
import { formatDistanceToNow } from "date-fns";
import type { Review, ReviewCardProps } from "@/types/review/types";

const ReviewCard: React.FC<ReviewCardProps> = ({ review }) => {
  const statusConfig = {
    completed: {
      icon: CheckCircle2,
      color:
        "bg-white text-green-500 border-green-500 hover:text-green-600 hover:border-green-600",
      text: "Completed",
    },
    pending: {
      icon: Clock,
      color:
        "bg-white text-yellow-600 border-yellow-600 hover:text-yellow-700 hover:border-yellow-700",
      text: "In Progress",
    },
    failed: {
      icon: XCircle,
      color:
        "bg-white text-red-500 border-red-500 hover:text-red-600 hover:border-red-600",
      text: "Failed",
    },
    default: {
      icon: Clock,
      color:
        "bg-white text-gray-500 border-gray-500 hover:text-gray-600 hover:border-gray-600",
      text: review.status,
    },
  };

  const config =
    statusConfig[review.status as keyof typeof statusConfig] ||
    statusConfig.default;
  const Icon = config.icon;

  const timeAgo = formatDistanceToNow(new Date(review.createdAt), {
    addSuffix: true,
  });

  return (
    <Card className="shadow-lg transition-all duration-300 hover:shadow-2xl hover:border-blue-300">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-bold text-gray-900 pr-4">
            <h2>
              {review.prTitle} @{review.repository.fullName}
            </h2>
          </CardTitle>

          <div className="flex items-center gap-x-2">
            <Badge
              className={`text-white font-semibold flex items-center ${config.color}`}
            >
              <Icon className="w-4 h-4 mr-1" />
              {config.text}
            </Badge>

            <Badge
              className={`font-semibold flex items-center bg-white text-gray-500 border-gray-500 hover:text-gray-600 hover:border-gray-600`}
            >
              <Clock className="w-4 h-4 mr-1" />
              Reviewed {timeAgo}
            </Badge>

            <Badge
              className={`font-semibold bg-white text-blue-500 border-blue-500 hover:text-blue-600 hover:border-blue-600`}
            >
              <a
                href={review.prUrl}
                className="flex gap-x-2"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="w-4 h-4 mr-1" />
                Visit PR
              </a>
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 sm:px-6">
        <div className="max-h-60 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3 shadow-inner">
          <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono">
            {review.review}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
};

// --- Main Page Component ---
function ReviewPage() {
  const { data: reviews, isLoading } = useQuery<Review[] | null>({
    queryKey: ["reviews"],
    queryFn: async () => {
      return await getReviews();
    },
  });

  const reviewsArray = reviews || [];
  const isEmpty = !isLoading && reviewsArray.length === 0;

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64 text-gray-500">
        <Loader2 className="mr-2 h-6 w-6 animate-spin text-blue-600" />
        <span className="text-lg">Loading AI reviews...</span>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-6 min-h-screen">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-1">
        AI Code Review History
      </h1>
      <p className="text-gray-600 mb-8">
        See all automated pull request analyses performed by the AI Code
        Reviewer.
      </p>

      {/* List or Empty State */}
      {isEmpty ? (
        <Card className="shadow-lg p-12 bg-white border-dashed border-2 border-gray-300 flex flex-col items-center justify-center text-center">
          <XCircle className="h-10 w-10 text-red-500 mb-4" />
          <CardTitle className="text-xl font-semibold text-gray-800 mb-2">
            No Reviews Found
          </CardTitle>
          <CardDescription className="text-gray-600">
            The AI Reviewer hasn not completed any reviews yet. Push a new PR to
            a connected repository to get started!
          </CardDescription>
        </Card>
      ) : (
        <div className="space-y-3">
          {reviewsArray.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </div>
      )}
    </div>
  );
}

export default ReviewPage;
