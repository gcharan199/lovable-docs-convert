import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import pdf from "npm:pdf-parse@1.1.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileUrl, conversionId } = await req.json();

    if (!fileUrl || !conversionId) {
      return new Response(
        JSON.stringify({ error: 'fileUrl and conversionId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Update status to processing
    await supabase
      .from('conversions')
      .update({ status: 'processing' })
      .eq('id', conversionId);

    // Download the PDF file
    const pdfResponse = await fetch(fileUrl);
    if (!pdfResponse.ok) {
      throw new Error(`Failed to download PDF: ${pdfResponse.status}`);
    }

    const pdfBuffer = await pdfResponse.arrayBuffer();

    // Use pdf-parse to extract text
    const data = await pdf(Buffer.from(pdfBuffer));

    const extractedText = data.text?.trim();
    if (!extractedText) {
      throw new Error('No text could be extracted. The PDF may contain only scanned images — text-based PDFs work best with this open-source extractor.');
    }

    const pageCount = data.numpages || 1;

    // Update conversion record
    await supabase
      .from('conversions')
      .update({
        status: 'completed',
        extracted_text: extractedText,
        page_count: pageCount,
      })
      .eq('id', conversionId);

    return new Response(
      JSON.stringify({ success: true, extractedText, pageCount }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('OCR processing error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Try to mark conversion as failed
    try {
      const body = await req.clone().json().catch(() => null);
      if (body?.conversionId) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);
        await supabase
          .from('conversions')
          .update({ status: 'failed', error_message: errorMessage })
          .eq('id', body.conversionId);
      }
    } catch {}

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
