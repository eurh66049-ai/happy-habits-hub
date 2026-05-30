import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, AlertCircle, CheckCircle, FileText, Image, User } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { storageCleanup } from '@/utils/storageCleanup';
import { uploadFileToS3 } from '@/utils/s3Client';

interface SimpleUploaderProps {
  onComplete: (files: {
    coverImageUrl?: string;
    bookFileUrl?: string;
    authorImageUrl?: string;
  }) => void;
  onError?: () => void;
  coverFile?: File | null;
  bookFile?: File | null;
  authorImageFile?: File | null;
}

export const SimpleBookUploader: React.FC<SimpleUploaderProps> = ({
  onComplete,
  onError,
  coverFile,
  bookFile,
  authorImageFile
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [currentStep, setCurrentStep] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // رفع موحّد إلى AWS S3 عبر signed URL.
  // يُرجع مرجعاً بالشكل s3://kotobi/<object_key> يُحفظ في قاعدة البيانات.
  const uploadSingleFile = async (
    file: File,
    folder: string,
    onProgress?: (percent: number) => void,
  ): Promise<string> => {
    console.log(`🔄 رفع ${file.name} إلى S3 (${formatFileSize(file.size)}) - المجلد: ${folder}`);

    try {
      const { reference } = await uploadFileToS3(file, folder, onProgress);
      console.log(`✅ تم رفع ${file.name} بنجاح إلى:`, reference);
      // نسجّل المرجع لتنظيفه إذا فشل أي ملف لاحق
      storageCleanup.registerUploadedFile(reference, 's3-kotobi');
      return reference;
    } catch (uploadError: any) {
      console.error('❌ خطأ في رفع الملف إلى S3:', {
        error: uploadError,
        message: uploadError?.message,
        fileName: file.name,
        fileSize: file.size,
        folder,
      });
      throw uploadError;
    }
  };

  const startUpload = async () => {
    if (!coverFile && !bookFile && !authorImageFile) {
      toast({
        title: "❌ خطأ",
        description: "لا توجد ملفات للرفع",
        variant: "destructive"
      });
      return;
    }

    // التحقق من حجم ملف الكتاب - الحد الأقصى 50MB
    const maxFileSize = 50 * 1024 * 1024; // 50 ميجابايت
    if (bookFile && bookFile.size > maxFileSize) {
      toast({
        title: "❌ حجم الملف كبير جداً",
        description: `حجم ملف الكتاب ${formatFileSize(bookFile.size)}. الحد الأقصى المسموح هو 50 ميجابايت`,
        variant: "destructive"
      });
      return;
    }

    setIsUploading(true);
    setError(null);
    setProgress(0);
    
    // مسح سجل الملفات السابق قبل البدء
    storageCleanup.clearRegistry();

    try {
      const results: {
        coverImageUrl?: string;
        bookFileUrl?: string;
        authorImageUrl?: string;
      } = {};

      const filesToUpload = [];

      // ترتيب الملفات: صورة الغلاف أولاً، ثم صورة المؤلف، ثم ملف PDF
      if (coverFile) {
        filesToUpload.push({
          file: coverFile,
          type: 'cover',
          folder: 'covers',
          label: 'رفع صورة الغلاف'
        });
      }

      if (authorImageFile) {
        filesToUpload.push({
          file: authorImageFile,
          type: 'author',
          folder: 'authors',
          label: 'رفع صورة المؤلف'
        });
      }

      if (bookFile) {
        filesToUpload.push({
          file: bookFile,
          type: 'book',
          folder: 'books',
          label: 'رفع ملف الكتاب PDF'
        });
      }

      for (let i = 0; i < filesToUpload.length; i++) {
        const fileData = filesToUpload[i];
        const progressStep = (i / filesToUpload.length) * 100;

        setCurrentStep(`${fileData.label}...`);
        setProgress(progressStep);

        try {
          // إضافة تحديث تفصيلي للتقدم أثناء الرفع
          const fileSizeMB = Math.round(fileData.file.size / (1024 * 1024));
          if (fileSizeMB > 20) {
            setCurrentStep(`${fileData.label}... (${fileSizeMB}MB - قد يستغرق دقائق)`);
          }

          const url = await uploadSingleFile(fileData.file, fileData.folder, (p) => {
            // تحديث التقدم داخل الملف الحالي
            const fileWeight = 100 / filesToUpload.length;
            setProgress(progressStep + (p / 100) * fileWeight);
          });

          if (fileData.type === 'cover') {
            results.coverImageUrl = url;
          } else if (fileData.type === 'book') {
            results.bookFileUrl = url;
          } else if (fileData.type === 'author') {
            results.authorImageUrl = url;
          }

          setProgress(progressStep + (100 / filesToUpload.length));

        } catch (error: any) {
          console.error(`خطأ في ${fileData.label}:`, error);
          throw new Error(`فشل في ${fileData.label}: ${error.message}`);
        }
      }

      setCurrentStep('تم الرفع بنجاح!');
      setProgress(100);

      toast({
        title: "✅ نجح الرفع",
        description: "تم رفع جميع الملفات بنجاح"
      });
      
      // مسح سجل الملفات عند النجاح (لا نحتاج تنظيفها)
      storageCleanup.clearRegistry();
      onComplete(results);

    } catch (error: any) {
      console.error('❌ فشل الرفع:', error);
      setError(error.message);
      
      // تنظيف الملفات التي تم رفعها عند الفشل
      console.log('🧹 بدء تنظيف الملفات بسبب فشل الرفع...');
      await storageCleanup.cleanupAllFiles();
      
      toast({
        title: "❌ فشل في رفع الملفات",
        description: error.message + " - تم حذف الملفات المرفوعة",
        variant: "destructive"
      });
      
      // إشعار المكون الأب بالفشل
      if (onError) {
        onError();
      }
    } finally {
      setIsUploading(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    } else if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(2)} KB`;
    }
    return `${bytes} B`;
  };

  const filesToUpload = [
    coverFile && { name: 'صورة الغلاف', file: coverFile, icon: Image },
    authorImageFile && { name: 'صورة المؤلف', file: authorImageFile, icon: User },
    bookFile && { name: 'ملف الكتاب', file: bookFile, icon: FileText }
  ].filter(Boolean);

  return (
    <Card>
      <CardContent className="p-6">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">رفع الملفات</h3>
          </div>

          {/* عرض الملفات المحددة */}
          <div className="space-y-2">
            {filesToUpload.map((item, index) => {
              const IconComponent = item.icon;
              return (
                <div key={index} className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <IconComponent className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.file.name} ({formatFileSize(item.file.size)})
                    </p>
                  </div>
                  {isUploading && (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  )}
                </div>
              );
            })}
          </div>

          {/* شريط التقدم */}
          {isUploading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{currentStep}</span>
                <span className="text-sm text-muted-foreground">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {/* رسالة الخطأ */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* رسالة النجاح */}
          {progress === 100 && !error && (
            <div className="flex items-center gap-2 p-3 bg-green-50 text-green-700 rounded-lg">
              <CheckCircle className="h-4 w-4" />
              <span className="text-sm">تم رفع جميع الملفات بنجاح!</span>
            </div>
          )}

          {/* زر البدء */}
          <Button 
            onClick={startUpload}
            disabled={isUploading || filesToUpload.length === 0}
            className="w-full"
          >
            {isUploading ? 'جاري الرفع...' : `رفع ${filesToUpload.length} ملف`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};